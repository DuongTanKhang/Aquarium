import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  productSummary: string;
  totalAmount: string;
  status: string;
  createdAt: Date;
}

export interface DashboardSummary {
  products: number;
  orders: number;
  customers: number;
  lowStockProducts: number;
  revenue: string;
  revenueChange: number;
  averageOrderValue: string;
  salesTrend: Array<{ date: string; revenue: string; orders: number }>;
  categoryMix: Array<{ name: string; revenue: string; orders: number; percentage: number }>;
  recentOrders: DashboardOrder[];
  topProducts: Array<{
    id: string;
    name: string;
    type: string;
    price: string;
    stockQuantity: number;
    soldQuantity: number;
  }>;
}

@Injectable()
export class DashboardService {
  private readonly cacheTtlMs: number;
  private summaryCache?: { expiresAt: number; value: DashboardSummary };
  private summaryInFlight?: Promise<DashboardSummary>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.cacheTtlMs = config.get<number>("DASHBOARD_CACHE_TTL_SECONDS", 10) * 1_000;
  }

  async getSummary(): Promise<DashboardSummary> {
    const now = Date.now();
    const cached = this.summaryCache;
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    // A single dashboard refresh fans out to several aggregate queries. Share
    // the promise so concurrent admin tabs do not create a query stampede.
    if (this.summaryInFlight) {
      return this.summaryInFlight;
    }

    const request = this.loadSummary(cached?.value);
    this.summaryInFlight = request;
    const clearInFlight = (): void => {
      if (this.summaryInFlight === request) {
        this.summaryInFlight = undefined;
      }
    };
    // Handle both branches so cleanup itself never creates an unhandled
    // rejection when the initial dashboard query fails.
    void request.then(clearInFlight, clearInFlight);
    return request;
  }

  private async loadSummary(staleValue?: DashboardSummary): Promise<DashboardSummary> {
    try {
      const value = await this.querySummary();
      this.summaryCache = {
        value,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
      return value;
    } catch (error) {
      // Keep the dashboard usable during a short database/network blip. The
      // next request will retry because the stale value is never re-expired.
      if (staleValue) {
        return staleValue;
      }
      throw error;
    }
  }

  private async querySummary(): Promise<DashboardSummary> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * DAY_MS);
    const previousStart = new Date(now.getTime() - 60 * DAY_MS);
    const validOrder = { status: { not: "CANCELLED" as const } };

    const [products, orders, customers, lowStockProducts, currentRevenue, previousRevenue, currentOrders] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.user.count({ where: { role: "CUSTOMER" } }),
      this.prisma.product.count({ where: { stockQuantity: { lte: 5 }, status: "ACTIVE" } }),
      this.prisma.order.aggregate({ where: { ...validOrder, createdAt: { gte: periodStart } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { ...validOrder, createdAt: { gte: previousStart, lt: periodStart } }, _sum: { totalAmount: true } }),
      this.prisma.order.findMany({
        where: { ...validOrder, createdAt: { gte: periodStart } },
        include: { items: { select: { productName: true, quantity: true } } },
        orderBy: { createdAt: "desc" },
        take: 7,
      }),
    ]);

    const currentTotal = Number(currentRevenue._sum.totalAmount ?? 0);
    const previousTotal = Number(previousRevenue._sum.totalAmount ?? 0);
    const revenueChange = previousTotal === 0 ? (currentTotal > 0 ? 100 : 0) : ((currentTotal - previousTotal) / previousTotal) * 100;
    const [salesTrend, categoryMix, topProducts] = await Promise.all([
      this.buildSalesTrend(periodStart, now),
      this.buildCategoryMix(periodStart, currentTotal),
      this.buildTopProducts(periodStart),
    ]);

    return {
      products,
      orders,
      customers,
      lowStockProducts,
      revenue: currentTotal.toFixed(2),
      revenueChange: Number(revenueChange.toFixed(1)),
      averageOrderValue: currentRevenue._count._all ? (currentTotal / currentRevenue._count._all).toFixed(2) : "0.00",
      salesTrend,
      categoryMix,
      recentOrders: currentOrders.map((order) => this.serializeOrder(order)),
      topProducts,
    };
  }

  async getAnalytics(days = 30): Promise<Pick<DashboardSummary, "salesTrend" | "categoryMix" | "topProducts" | "revenue" | "averageOrderValue" | "revenueChange">> {
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 7), 365) : 30;
    const now = new Date();
    const periodStart = new Date(now.getTime() - safeDays * DAY_MS);
    const previousStart = new Date(now.getTime() - safeDays * 2 * DAY_MS);
    const validOrder = { status: { not: "CANCELLED" as const } };
    const [currentRevenue, previousRevenue] = await Promise.all([
      this.prisma.order.aggregate({ where: { ...validOrder, createdAt: { gte: periodStart } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { ...validOrder, createdAt: { gte: previousStart, lt: periodStart } }, _sum: { totalAmount: true } }),
    ]);
    const revenue = Number(currentRevenue._sum.totalAmount ?? 0);
    const previous = Number(previousRevenue._sum.totalAmount ?? 0);
    const [salesTrend, categoryMix, topProducts] = await Promise.all([
      this.buildSalesTrend(periodStart, now),
      this.buildCategoryMix(periodStart, revenue),
      this.buildTopProducts(periodStart),
    ]);
    return {
      revenue: revenue.toFixed(2),
      averageOrderValue: currentRevenue._count._all ? (revenue / currentRevenue._count._all).toFixed(2) : "0.00",
      revenueChange: Number((previous === 0 ? (revenue > 0 ? 100 : 0) : ((revenue - previous) / previous) * 100).toFixed(1)),
      salesTrend,
      categoryMix,
      topProducts,
    };
  }

  private async buildSalesTrend(start: Date, end: Date): Promise<Array<{ date: string; revenue: string; orders: number }>> {
    const rows = await this.prisma.order.findMany({
      where: { status: { not: "CANCELLED" }, createdAt: { gte: start, lte: end } },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: "asc" },
    });
    const grouped = new Map<string, { revenue: number; orders: number }>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const value = grouped.get(date) ?? { revenue: 0, orders: 0 };
      value.revenue += Number(row.totalAmount);
      value.orders += 1;
      grouped.set(date, value);
    }
    return Array.from(grouped.entries()).map(([date, value]) => ({ date, revenue: value.revenue.toFixed(2), orders: value.orders }));
  }

  private async buildCategoryMix(start: Date, totalRevenue: number): Promise<Array<{ name: string; revenue: string; orders: number; percentage: number }>> {
    const rows = await this.prisma.orderItem.findMany({
      where: { order: { status: { not: "CANCELLED" }, createdAt: { gte: start } } },
      select: { subtotal: true, orderId: true, product: { select: { category: { select: { name: true } } } } },
    });
    const grouped = new Map<string, { revenue: number; orders: Set<string> }>();
    for (const row of rows) {
      const name = row.product.category.name;
      const value = grouped.get(name) ?? { revenue: 0, orders: new Set<string>() };
      value.revenue += Number(row.subtotal);
      value.orders.add(row.orderId);
      grouped.set(name, value);
    }
    return Array.from(grouped.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, value]) => ({
      name,
      revenue: value.revenue.toFixed(2),
      orders: value.orders.size,
      percentage: totalRevenue > 0 ? Number(((value.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }));
  }

  private async buildTopProducts(start: Date): Promise<DashboardSummary["topProducts"]> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: { status: { not: "CANCELLED" }, createdAt: { gte: start } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    });
    if (!grouped.length) return [];
    const products = await this.prisma.product.findMany({ where: { id: { in: grouped.map((row) => row.productId) } }, select: { id: true, name: true, type: true, price: true, stockQuantity: true } });
    const byId = new Map(products.map((product) => [product.id, product]));
    return grouped.flatMap((row) => {
      const product = byId.get(row.productId);
      return product ? [{ id: product.id, name: product.name, type: product.type, price: product.price.toString(), stockQuantity: product.stockQuantity, soldQuantity: row._sum.quantity ?? 0 }] : [];
    });
  }

  private serializeOrder(order: { id: string; orderNumber: string; customerName: string; totalAmount: unknown; status: string; createdAt: Date; items: Array<{ productName: string; quantity: number }> }): DashboardOrder {
    const names = order.items.map((item) => `${item.productName} · ${item.quantity}`).slice(0, 2);
    return { id: order.id, orderNumber: order.orderNumber, customerName: order.customerName, productSummary: names.join(", ") || "No items", totalAmount: String(order.totalAmount), status: order.status, createdAt: order.createdAt };
  }
}
