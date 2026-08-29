import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  paginationMeta,
  type PaginationMeta,
} from "../../common/dto/pagination.dto.js";
import { toSlug } from "../../common/utils/slug.js";
import { Prisma } from "../../generated/prisma/client.js";
import { ProductStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import {
  AdminCategoryQueryDto,
  PublicCategoryQueryDto,
} from "./dto/category-query.dto.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { UpdateCategoryDto } from "./dto/update-category.dto.js";

type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } };
}>;

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: PublicCategoryQueryDto): Promise<{
    data: CategoryResponse[];
    meta: PaginationMeta;
  }> {
    const where: Prisma.CategoryWhereInput = {
      isActive: true,
      ...(query.search
        ? { name: { contains: query.search, mode: "insensitive" } }
        : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        include: {
          _count: {
            select: {
              products: { where: { status: ProductStatus.ACTIVE } },
            },
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getPublicBySlug(slug: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findFirst({
      where: { slug: toSlug(slug), isActive: true },
      include: {
        _count: {
          select: { products: { where: { status: ProductStatus.ACTIVE } } },
        },
      },
    });

    if (!category) throw new NotFoundException("Không tìm thấy danh mục");
    return this.serialize(category);
  }

  async listAdmin(query: AdminCategoryQueryDto): Promise<{
    data: CategoryResponse[];
    meta: PaginationMeta;
  }> {
    const where: Prisma.CategoryWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { slug: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getAdminById(id: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!category) throw new NotFoundException("Không tìm thấy danh mục");
    return this.serialize(category);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    const slug = toSlug(dto.slug ?? dto.name);
    if (!slug) throw new BadRequestException("Slug danh mục không hợp lệ");

    try {
      const category = await this.prisma.category.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description || null,
          isActive: dto.isActive ?? true,
        },
        include: { _count: { select: { products: true } } },
      });
      return this.serialize(category);
    } catch (error: unknown) {
      if (this.isPrismaError(error, "P2002")) {
        throw new ConflictException("Slug danh mục đã tồn tại");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    await this.ensureExists(id);
    const slug = dto.slug === undefined ? undefined : toSlug(dto.slug);
    if (slug === "")
      throw new BadRequestException("Slug danh mục không hợp lệ");

    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: {
          name: dto.name,
          slug,
          description:
            dto.description === undefined ? undefined : dto.description || null,
          isActive: dto.isActive,
        },
        include: { _count: { select: { products: true } } },
      });
      return this.serialize(category);
    } catch (error: unknown) {
      if (this.isPrismaError(error, "P2002")) {
        throw new ConflictException("Slug danh mục đã tồn tại");
      }
      throw error;
    }
  }

  async remove(id: string, cascade = false): Promise<void> {
    if (!cascade) {
      const category = await this.prisma.category.findUnique({
        where: { id },
        select: { id: true, _count: { select: { products: true } } },
      });

      if (!category) throw new NotFoundException("Không tìm thấy danh mục");
      if (category._count.products > 0) {
        throw new ConflictException(
          "Danh mục đang có sản phẩm; hãy chuyển sản phẩm hoặc ngừng kích hoạt danh mục",
        );
      }

      await this.prisma.category.delete({ where: { id } });
      return;
    }

    // Category deletion from the admin UI is an explicit cascade action. Keep
    // order and inventory history immutable: products referenced by either
    // table must be archived/moved instead of being physically removed.
    try {
      await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!category) throw new NotFoundException("Không tìm thấy danh mục");

        const products = await transaction.product.findMany({
          where: { categoryId: id },
          select: { id: true },
        });
        const productIds = products.map((product) => product.id);
        if (productIds.length) {
          const [orderItemCount, inventoryTransactionCount] = await Promise.all([
            transaction.orderItem.count({ where: { productId: { in: productIds } } }),
            transaction.inventoryTransaction.count({ where: { productId: { in: productIds } } }),
          ]);
          if (orderItemCount > 0 || inventoryTransactionCount > 0) {
            throw new ConflictException(
              "Some products in this category have order or inventory history; hide or move them instead of deleting them",
            );
          }
          await transaction.product.deleteMany({ where: { categoryId: id } });
        }
        await transaction.category.delete({ where: { id } });
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
      if (this.isPrismaError(error, "P2003")) {
        throw new ConflictException(
          "Some products in this category are protected by business history; hide or move them instead of deleting them",
        );
      }
      throw error;
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Không tìm thấy danh mục");
  }

  private serialize(category: CategoryWithCount): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: category.isActive,
      productCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
