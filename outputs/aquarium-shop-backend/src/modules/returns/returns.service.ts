import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { ReturnRequestStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import { EmailService } from "../auth/email.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { CreateReturnRequestDto } from "./dto/create-return-request.dto.js";
import { UpdateReturnRequestDto } from "./dto/update-return-request.dto.js";

const requestInclude = {
  order: { select: { id: true, orderNumber: true, status: true, customerEmail: true, customerName: true, totalAmount: true } },
  customer: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.ReturnRequestInclude;
type ReturnRequestWithRelations = Prisma.ReturnRequestGetPayload<{ include: typeof requestInclude }>;

const transitions: Record<ReturnRequestStatus, ReturnRequestStatus[]> = {
  REQUESTED: [ReturnRequestStatus.APPROVED, ReturnRequestStatus.REJECTED],
  APPROVED: [ReturnRequestStatus.RECEIVED, ReturnRequestStatus.REFUNDED, ReturnRequestStatus.COMPLETED],
  REJECTED: [],
  RECEIVED: [ReturnRequestStatus.REFUNDED, ReturnRequestStatus.COMPLETED],
  REFUNDED: [ReturnRequestStatus.COMPLETED],
  COMPLETED: [],
};

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService, private readonly payments: PaymentsService) {}

  async create(customerId: string, dto: CreateReturnRequestDto) {
    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, customerId }, include: { payment: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status === "CANCELLED") throw new BadRequestException("Cancelled orders cannot be returned");
    if (order.payment?.status !== "PAID") throw new BadRequestException("A paid order is required before requesting a return or refund");
    const existing = await this.prisma.returnRequest.findFirst({ where: { orderId: dto.orderId, status: { notIn: [ReturnRequestStatus.REJECTED, ReturnRequestStatus.COMPLETED] } } });
    if (existing) throw new ConflictException("This order already has an active return request");
    const row = await this.prisma.returnRequest.create({ data: { orderId: order.id, customerId, type: dto.type, reason: dto.reason.trim(), amount: order.totalAmount }, include: requestInclude });
    return this.serialize(row);
  }

  async listMine(customerId: string) {
    const rows = await this.prisma.returnRequest.findMany({ where: { customerId }, include: requestInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    return rows.map((row) => this.serialize(row));
  }

  async listAdmin() {
    const rows = await this.prisma.returnRequest.findMany({ include: requestInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 });
    return rows.map((row) => this.serialize(row));
  }

  async update(id: string, dto: UpdateReturnRequestDto, createdBy?: string) {
    const current = await this.prisma.returnRequest.findUnique({ where: { id }, include: requestInclude });
    if (!current) throw new NotFoundException("Return request not found");
    if (current.status !== dto.status && !transitions[current.status].includes(dto.status)) {
      throw new ConflictException(`Cannot move a ${current.status.toLowerCase()} request to ${dto.status.toLowerCase()}`);
    }
    let providerRefundId = dto.providerRefundId?.trim();
    let refundStatus: string | undefined;
    if (dto.status === ReturnRequestStatus.REFUNDED && !providerRefundId) {
      const payment = await this.prisma.payment.findUnique({ where: { orderId: current.orderId }, select: { method: true } });
      if (payment?.method !== "PAYPAL") {
        throw new BadRequestException("Only PayPal refunds can be automated; provide a processor refund reference");
      }
      const refund = await this.payments.refundPayPalCapture(current.orderId);
      providerRefundId = refund.refundId;
      refundStatus = refund.status;
    }
    if (dto.status === ReturnRequestStatus.REFUNDED && !providerRefundId) {
      throw new BadRequestException("A provider refund reference is required before marking money as refunded");
    }
    const row = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.returnRequest.update({ where: { id }, data: { status: dto.status, adminNote: dto.adminNote?.trim() || undefined, resolutionNote: dto.resolutionNote?.trim() || undefined, providerRefundId: providerRefundId || undefined }, include: requestInclude });
      if (current.status !== dto.status) {
        await transaction.orderStatusHistory.create({ data: { orderId: current.orderId, status: current.order.status, note: `Return request ${id} moved to ${dto.status.toLowerCase()}${dto.adminNote ? `: ${dto.adminNote.trim()}` : ""}`, createdBy: createdBy ?? null } });
      }
      if (dto.status === ReturnRequestStatus.REFUNDED) {
        await transaction.payment.update({ where: { orderId: current.orderId }, data: { status: "REFUNDED", providerPayload: { returnRequestId: id, providerRefundId, providerRefundStatus: refundStatus ?? "MANUAL_CONFIRMED", refundedAt: new Date().toISOString() } } });
      }
      return updated;
    });
    if (row.order.customerEmail) {
      void this.email.sendOrderStatusUpdate(row.order.customerEmail, row.customer.fullName, row.order.orderNumber, `RETURN_${dto.status}`, dto.resolutionNote ?? dto.adminNote).catch(() => undefined);
    }
    return this.serialize(row);
  }

  private serialize(row: ReturnRequestWithRelations) {
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      customerId: row.customerId,
      customerName: row.customer.fullName,
      customerEmail: row.customer.email,
      type: row.type,
      status: row.status,
      reason: row.reason,
      amount: row.amount.toString(),
      adminNote: row.adminNote,
      resolutionNote: row.resolutionNote,
      providerRefundId: row.providerRefundId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
