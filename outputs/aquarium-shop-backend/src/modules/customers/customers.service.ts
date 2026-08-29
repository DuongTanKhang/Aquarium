import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma.service.js";
import { paginationMeta, type PaginationMeta } from "../../common/dto/pagination.dto.js";
import { CustomerQueryDto } from "./dto/customer-query.dto.js";

export interface CustomerResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  totalOrders: number;
  totalSpent: string;
  lastOrderAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerQueryDto): Promise<{ data: CustomerResponse[]; meta: PaginationMeta }> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      role: "CUSTOMER",
      ...(search ? { OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, fullName: true, email: true, phone: true, status: true, createdAt: true, _count: { select: { orders: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    const ids = users.map((user) => user.id);
    const orderStats = ids.length ? await this.prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: { not: "CANCELLED" } }, _sum: { totalAmount: true }, _count: { _all: true }, _max: { createdAt: true } }) : [];
    const byCustomer = new Map(orderStats.flatMap((stat) => stat.customerId ? [[stat.customerId, stat]] as const : []));
    return { data: users.map((user) => this.serialize(user, byCustomer.get(user.id))), meta: paginationMeta(query.page, query.pageSize, totalItems) };
  }

  async getById(id: string): Promise<CustomerResponse> {
    const user = await this.prisma.user.findFirst({ where: { id, role: "CUSTOMER" }, select: { id: true, fullName: true, email: true, phone: true, status: true, createdAt: true, _count: { select: { orders: true } } } });
    if (!user) throw new NotFoundException("Không tìm thấy khách hàng");
    const stats = await this.prisma.order.aggregate({ where: { customerId: id, status: { not: "CANCELLED" } }, _sum: { totalAmount: true }, _count: { _all: true }, _max: { createdAt: true } });
    return this.serialize(user, { _sum: stats._sum, _count: stats._count, _max: stats._max });
  }

  private serialize(user: { id: string; fullName: string; email: string; phone: string | null; status: string; createdAt: Date; _count: { orders: number } }, stats?: { _sum: { totalAmount: Prisma.Decimal | null }; _count: { _all: number }; _max: { createdAt: Date | null } }): CustomerResponse {
    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, status: user.status, totalOrders: stats?._count._all ?? user._count.orders, totalSpent: (stats?._sum.totalAmount ?? 0).toString(), lastOrderAt: stats?._max.createdAt ?? null, createdAt: user.createdAt };
  }
}
