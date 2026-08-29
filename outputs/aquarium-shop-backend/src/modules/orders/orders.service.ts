import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { OrderStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import { paginationMeta, type PaginationMeta } from "../../common/dto/pagination.dto.js";
import { OrderQueryDto } from "./dto/order-query.dto.js";
import { CreateOrderDto } from "./dto/create-order.dto.js";
import { LookupOrderDto } from "./dto/lookup-order.dto.js";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto.js";
import { EmailService } from "../auth/email.service.js";

const orderInclude = {
  items: { select: { id: true, productId: true, productName: true, sku: true, unitPrice: true, quantity: true, subtotal: true } },
  payment: { select: { method: true, status: true, amount: true, transactionCode: true, paidAt: true } },
  customer: { select: { id: true, email: true, fullName: true } },
  statusHistory: { select: { status: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const DEFAULT_CHECKOUT_METHODS = new Set(["CARD", "PAYPAL"]);

export interface OrderResponse {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: string;
  note: string | null;
  status: OrderStatus;
  subtotal: string;
  shippingFee: string;
  discountAmount: string;
  totalAmount: string;
  items: Array<{ id: string; productName: string; sku: string; unitPrice: string; quantity: number; subtotal: string }>;
  payment: { method: string; status: string; amount: string; transactionCode: string | null; paidAt: Date | null } | null;
  customer: { id: string; email: string; fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicOrderResponse {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  subtotal: string;
  shippingFee: string;
  totalAmount: string;
  items: Array<{ productName: string; quantity: number; subtotal: string }>;
  payment: { method: string; status: string; amount: string } | null;
  statusHistory: Array<{ status: OrderStatus; note: string | null; createdAt: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  /**
   * Creates a customer checkout order from server-owned product prices and stock.
   * The client only supplies product IDs/quantities; totals are never trusted
   * from the browser. Stock decrement, order items, payment intent placeholder
   * and inventory audit rows commit together or roll back together.
   */
  async createPublic(dto: CreateOrderDto, customerId: string): Promise<OrderResponse> {
    const productIds = dto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException("Each product may appear only once in checkout");
    }

    const row = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.user.findUnique({ where: { id: customerId }, select: { email: true, fullName: true, phone: true, address: true, role: true, status: true, emailVerifiedAt: true, phoneVerifiedAt: true } });
      if (!account || account.role !== "CUSTOMER" || account.status !== "ACTIVE") {
        throw new BadRequestException("Customer account is not active");
      }
      if (!account.emailVerifiedAt || !account.phoneVerifiedAt) {
        throw new BadRequestException("Please verify your email and US phone before checkout");
      }
      const customerName = account.fullName;
      const customerEmail = account.email;
      const customerPhone = account.phone ?? dto.customerPhone;
      const settings = await transaction.paymentSettings.findUnique({
        where: { id: "default" },
        select: { methods: true },
      });
      const selectedMethodEnabled = !settings
        ? DEFAULT_CHECKOUT_METHODS.has(dto.paymentMethod)
        : Array.isArray(settings.methods)
          ? settings.methods.some((method: unknown) => typeof method === "object" && method !== null && (method as { id?: unknown }).id === dto.paymentMethod && (method as { enabled?: unknown }).enabled === true)
          : DEFAULT_CHECKOUT_METHODS.has(dto.paymentMethod);
      if (!selectedMethodEnabled) {
        throw new BadRequestException("The selected payment method is not currently available");
      }

      const products = await transaction.product.findMany({
        where: {
          id: { in: productIds },
          status: "ACTIVE",
          category: { isActive: true },
        },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          stockQuantity: true,
        },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException("One or more products are no longer available");
      }

      const byId = new Map(products.map((product) => [product.id, product]));
      const lineItems = dto.items.map((item) => {
        const product = byId.get(item.productId);
        if (!product) throw new BadRequestException("One or more products are no longer available");
        return {
          input: item,
          product,
          subtotal: new Prisma.Decimal(product.price).mul(item.quantity),
        };
      });
      const subtotal = lineItems.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
      // Store prices and checkout totals are USD. Free shipping starts at $80;
      // otherwise the flat domestic shipping fee is $6.
      const shippingFee = subtotal.gte(80) ? new Prisma.Decimal(0) : new Prisma.Decimal(6);
      const totalAmount = subtotal.add(shippingFee);
      const orderNumber = await this.nextOrderNumber(transaction);

      // Conditional updates prevent two concurrent checkouts from overselling
      // the same fish. Serializable isolation/retry at the edge can safely
      // handle a conflicting transaction without exposing stale stock.
      for (const line of lineItems) {
        const updated = await transaction.product.updateMany({
          where: {
            id: line.product.id,
            status: "ACTIVE",
            stockQuantity: { gte: line.input.quantity },
          },
          data: { stockQuantity: { decrement: line.input.quantity } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(`${line.product.name} is no longer available in the requested quantity`);
        }
      }

      const created = await transaction.order.create({
        data: {
          orderNumber,
          customerId,
          customerName,
          customerPhone,
          customerEmail: customerEmail.toLowerCase(),
          shippingAddress: dto.shippingAddress,
          note: dto.note || null,
          status: "PENDING",
          subtotal,
          shippingFee,
          discountAmount: new Prisma.Decimal(0),
          totalAmount,
          items: {
            create: lineItems.map((line) => ({
              productId: line.product.id,
              productName: line.product.name,
              sku: line.product.sku,
              unitPrice: line.product.price,
              quantity: line.input.quantity,
              subtotal: line.subtotal,
            })),
          },
          payment: {
            create: {
              method: dto.paymentMethod,
              status: "PENDING",
              amount: totalAmount,
            },
          },
          statusHistory: {
            create: { status: "PENDING", note: "Order placed from storefront checkout" },
          },
        },
        include: orderInclude,
      });

      for (const line of lineItems) {
        await transaction.inventoryTransaction.create({
          data: {
            productId: line.product.id,
            type: "SALE",
            quantity: line.input.quantity,
            stockBefore: line.product.stockQuantity,
            stockAfter: line.product.stockQuantity - line.input.quantity,
            referenceId: created.id,
            note: `Checkout ${orderNumber}`,
          },
        });
      }
      return created;
    });
    if (row.customerEmail) {
      void this.email.sendOrderStatusUpdate(row.customerEmail, row.customer?.fullName ?? row.customerName, row.orderNumber, row.status, "We received your order and will email you when payment and fulfillment progress.").catch(() => undefined);
    }
    return this.serialize(row);
  }

  /**
   * Guest order tracking requires both values that were supplied at checkout.
   * This avoids an enumerable public order endpoint while still allowing a
   * customer to follow an order from another device.
   */
  async lookupPublic(dto: LookupOrderDto): Promise<PublicOrderResponse> {
    const row = await this.prisma.order.findFirst({
      where: {
        orderNumber: dto.orderNumber.toUpperCase(),
        customerEmail: dto.email.toLowerCase(),
      },
      include: orderInclude,
    });
    if (!row) throw new NotFoundException("We could not find an order with those details");
    return this.serializePublic(row);
  }

  async listMine(userId: string): Promise<PublicOrderResponse[]> {
    const rows = await this.prisma.order.findMany({
      where: { customerId: userId },
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return rows.map((row) => this.serializePublic(row));
  }

  async notifyOrderConfirmation(orderId: string): Promise<void> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { productName: true, quantity: true, subtotal: true } }, customer: { select: { fullName: true } } },
    });
    if (!row?.customerEmail) return;
    await this.email.sendOrderConfirmation(
      row.customerEmail,
      row.customer?.fullName ?? row.customerName,
      row.orderNumber,
      row.totalAmount.toString(),
      row.items.map((item) => ({ productName: item.productName, quantity: item.quantity, subtotal: item.subtotal.toString() })),
    );
  }

  /**
   * Compensate a PayPal checkout that could not be created or captured.
   * The payment row is the idempotency guard: a reservation is restored only
   * while the payment is still pending, so retries cannot double the stock.
   */
  async failPendingPayment(orderId: string, customerId: string, reason: string): Promise<OrderResponse> {
    const row = await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { id: orderId, customerId },
        include: orderInclude,
      });
      if (!order) throw new NotFoundException("Order not found");
      if (!order.payment || order.payment.method !== "PAYPAL") {
        throw new BadRequestException("This order is not a PayPal checkout");
      }
      if (order.payment.status === "PENDING" && order.status !== OrderStatus.CANCELLED) {
        for (const item of order.items) {
          const product = await transaction.product.findUnique({ where: { id: item.productId }, select: { stockQuantity: true } });
          if (!product) continue;
          await transaction.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
          await transaction.inventoryTransaction.create({
            data: {
              productId: item.productId,
              type: "RETURN",
              quantity: item.quantity,
              stockBefore: product.stockQuantity,
              stockAfter: product.stockQuantity + item.quantity,
              referenceId: order.id,
              note: `Released PayPal reservation ${order.orderNumber}`,
            },
          });
        }
        await transaction.payment.update({ where: { orderId }, data: { status: "FAILED", providerPayload: { reason, failedAt: new Date().toISOString() } } });
        await transaction.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
        await transaction.orderStatusHistory.create({ data: { orderId, status: OrderStatus.CANCELLED, note: reason } });
      }
      return transaction.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
    return this.serialize(row);
  }

  private serializePublic(row: OrderWithRelations): PublicOrderResponse {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      status: row.status,
      subtotal: row.subtotal.toString(),
      shippingFee: row.shippingFee.toString(),
      totalAmount: row.totalAmount.toString(),
      items: row.items.map((item) => ({ productName: item.productName, quantity: item.quantity, subtotal: item.subtotal.toString() })),
      payment: row.payment ? { method: row.payment.method, status: row.payment.status, amount: row.payment.amount.toString() } : null,
      statusHistory: row.statusHistory.map((entry) => ({ status: entry.status, note: entry.note, createdAt: entry.createdAt })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async nextOrderNumber(transaction: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const candidate = `AQ-${Date.now().toString(36).toUpperCase()}-${suffix}`;
      const exists = await transaction.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new ConflictException("Could not allocate an order number; please try again");
  }

  async list(query: OrderQueryDto): Promise<{ data: OrderResponse[]; meta: PaginationMeta }> {
    const search = query.search?.trim();
    const fromDate = query.fromDate ? parseDateOnly(query.fromDate, "fromDate") : undefined;
    const toDate = query.toDate ? parseDateOnly(query.toDate, "toDate", true) : undefined;
    if (fromDate && toDate && fromDate >= toDate) {
      throw new BadRequestException("fromDate must be on or before toDate");
    }
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...((fromDate || toDate) ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
      ...(search ? { OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
        { customerEmail: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: orderInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.order.count({ where }),
    ]);
    return { data: rows.map((row) => this.serialize(row)), meta: paginationMeta(query.page, query.pageSize, totalItems) };
  }

  async getById(id: string): Promise<OrderResponse> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!row) throw new NotFoundException("Không tìm thấy đơn hàng");
    return this.serialize(row);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, createdBy?: string): Promise<OrderResponse> {
    const current = await this.prisma.order.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!current) throw new NotFoundException("Không tìm thấy đơn hàng");
    if (current.status === OrderStatus.CANCELLED && dto.status !== OrderStatus.CANCELLED) {
      throw new ConflictException("Đơn đã hủy không thể chuyển sang trạng thái khác");
    }
    const row = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.order.update({ where: { id }, data: { status: dto.status }, include: orderInclude });
      if (current.status !== dto.status || dto.note) {
        await transaction.orderStatusHistory.create({ data: { orderId: id, status: dto.status, note: dto.note?.trim() || null, createdBy: createdBy ?? null } });
      }
      return updated;
    });
    if (row.customerEmail && new Set<OrderStatus>([OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.SHIPPING, OrderStatus.COMPLETED, OrderStatus.CANCELLED]).has(dto.status)) {
      void this.email.sendOrderStatusUpdate(row.customerEmail, row.customer?.fullName ?? row.customerName, row.orderNumber, dto.status, dto.note).catch(() => undefined);
    }
    return this.serialize(row);
  }

  private serialize(row: OrderWithRelations): OrderResponse {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerEmail: row.customerEmail,
      shippingAddress: row.shippingAddress,
      note: row.note,
      status: row.status,
      subtotal: row.subtotal.toString(),
      shippingFee: row.shippingFee.toString(),
      discountAmount: row.discountAmount.toString(),
      totalAmount: row.totalAmount.toString(),
      items: row.items.map((item) => ({ id: item.id, productName: item.productName, sku: item.sku, unitPrice: item.unitPrice.toString(), quantity: item.quantity, subtotal: item.subtotal.toString() })),
      payment: row.payment ? { method: row.payment.method, status: row.payment.status, amount: row.payment.amount.toString(), transactionCode: row.payment.transactionCode, paidAt: row.payment.paidAt } : null,
      customer: row.customer,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function parseDateOnly(value: string, field: string, endExclusive = false): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} must be a valid calendar date in YYYY-MM-DD format`);
  }
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
