import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { InventoryTransactionType } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import { paginationMeta, type PaginationMeta } from "../../common/dto/pagination.dto.js";
import { InventoryQueryDto } from "./dto/inventory-query.dto.js";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto.js";

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  status: string;
  stockQuantity: number;
  lowStockThreshold: number;
  category: { id: string; name: string; slug: string };
  updatedAt: Date;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listLowStock(query: InventoryQueryDto): Promise<{ data: LowStockProduct[]; meta: PaginationMeta }> {
    const threshold = query.threshold ?? 5;
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      status: { not: "INACTIVE" },
      stockQuantity: { lte: threshold },
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: { category: { select: { id: true, name: true, slug: true } } }, orderBy: [{ stockQuantity: "asc" }, { updatedAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { data: rows, meta: paginationMeta(query.page, query.pageSize, totalItems) };
  }

  async adjust(productId: string, dto: AdjustInventoryDto, createdBy?: string) {
    const delta = this.toDelta(dto);
    if (delta === 0) throw new BadRequestException("Số lượng điều chỉnh phải khác 0");
    const result = await this.prisma.$transaction(async (transaction) => {
      const product = await transaction.product.findUnique({ where: { id: productId }, select: { id: true, stockQuantity: true } });
      if (!product) throw new NotFoundException("Không tìm thấy sản phẩm");
      const nextStock = product.stockQuantity + delta;
      if (nextStock < 0) throw new BadRequestException("Tồn kho không thể âm");
      const updated = await transaction.product.update({ where: { id: productId }, data: { stockQuantity: nextStock }, include: { category: { select: { id: true, name: true, slug: true } } } });
      await transaction.inventoryTransaction.create({ data: { productId, type: dto.type, quantity: Math.abs(delta), stockBefore: product.stockQuantity, stockAfter: nextStock, note: dto.note?.trim() || null, createdBy: createdBy ?? null } });
      return updated;
    });
    return result;
  }

  private toDelta(dto: AdjustInventoryDto): number {
    if (dto.type === InventoryTransactionType.ADJUSTMENT) return dto.quantity;
    if (dto.quantity <= 0) throw new BadRequestException("Số lượng phải lớn hơn 0");
    return dto.type === InventoryTransactionType.SALE || dto.type === InventoryTransactionType.DAMAGE ? -dto.quantity : dto.quantity;
  }
}
