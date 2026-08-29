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
import { CreateProductDto } from "./dto/create-product.dto.js";
import {
  AdminProductQueryDto,
  ProductQueryDto,
  ProductSort,
} from "./dto/product-query.dto.js";
import { UpdateProductDto } from "./dto/update-product.dto.js";

const PRODUCT_RELATIONS = {
  category: true,
  images: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_RELATIONS;
}>;

export interface ProductImageResponse {
  id: string;
  url: string;
  altText: string | null;
  position: number;
  isPrimary: boolean;
}

export interface ProductResponse {
  id: string;
  categoryId: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
  price: string;
  costPrice: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  size: string | null;
  careLevel: string | null;
  temperatureRange: string | null;
  category: { id: string; name: string; slug: string };
  images: ProductImageResponse[];
  createdAt: Date;
  updatedAt: Date;
}

// The storefront must never receive cost price or SKU. Available quantity is
// intentionally public so a customer can choose a valid quantity at checkout.
export interface PublicProductResponse {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  price: string;
  inStock: boolean;
  availableQuantity: number;
  category: { id: string; name: string; slug: string };
  images: ProductImageResponse[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: ProductQueryDto): Promise<{
    data: PublicProductResponse[];
    meta: PaginationMeta;
  }> {
    this.validatePriceRange(query.minPrice, query.maxPrice);
    const where = this.buildWhere(query, true);
    const result = await this.list(where, query);
    return {
      data: result.data.map((product) => this.serializePublic(product)),
      meta: result.meta,
    };
  }

  async getPublicBySlug(slug: string): Promise<PublicProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: {
        slug: toSlug(slug),
        status: ProductStatus.ACTIVE,
        category: { isActive: true },
      },
      include: PRODUCT_RELATIONS,
    });

    if (!product) throw new NotFoundException("Không tìm thấy sản phẩm");
    return this.serializePublic(this.serialize(product));
  }

  async listAdmin(query: AdminProductQueryDto): Promise<{
    data: ProductResponse[];
    meta: PaginationMeta;
  }> {
    this.validatePriceRange(query.minPrice, query.maxPrice);
    const where: Prisma.ProductWhereInput = {
      ...this.buildWhere(query, false),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
    return this.list(where, query);
  }

  async getAdminById(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_RELATIONS,
    });

    if (!product) throw new NotFoundException("Không tìm thấy sản phẩm");
    return this.serialize(product);
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    const category = await this.getCategory(dto.categoryId);
    if (dto.status === ProductStatus.ACTIVE && !category.isActive) {
      throw new BadRequestException(
        "Không thể bán sản phẩm trong danh mục đã ngừng hoạt động",
      );
    }

    const slug = toSlug(dto.slug ?? dto.name);
    if (!slug) throw new BadRequestException("Slug sản phẩm không hợp lệ");
    this.validateImages(dto.images);
    const images = dto.images ?? [];

    try {
      const product = await this.prisma.product.create({
        data: {
          categoryId: dto.categoryId,
          sku: dto.sku.toUpperCase(),
          name: dto.name,
          slug,
          description: dto.description || null,
          type: dto.type,
          status: dto.status ?? ProductStatus.DRAFT,
          price: dto.price,
          costPrice: dto.costPrice,
          stockQuantity: dto.stockQuantity ?? 0,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
          size: dto.size || null,
          careLevel: dto.careLevel || null,
          temperatureRange: dto.temperatureRange || null,
          images: images.length
            ? {
                create: images.map((image, index) => ({
                  url: image.url,
                  altText: image.altText || dto.name,
                  position: image.position ?? index,
                  isPrimary: this.isPrimaryImage(images, index),
                })),
              }
            : undefined,
        },
        include: PRODUCT_RELATIONS,
      });
      return this.serialize(product);
    } catch (error: unknown) {
      this.rethrowWriteError(error);
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const current = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!current) throw new NotFoundException("Không tìm thấy sản phẩm");

    const category = dto.categoryId
      ? await this.getCategory(dto.categoryId)
      : current.category;
    const nextStatus = dto.status ?? current.status;
    if (nextStatus === ProductStatus.ACTIVE && !category.isActive) {
      throw new BadRequestException(
        "Không thể bán sản phẩm trong danh mục đã ngừng hoạt động",
      );
    }

    const slug = dto.slug === undefined ? undefined : toSlug(dto.slug);
    if (slug === "")
      throw new BadRequestException("Slug sản phẩm không hợp lệ");
    this.validateImages(dto.images);
    const images = dto.images;

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          sku: dto.sku?.toUpperCase(),
          name: dto.name,
          slug,
          description:
            dto.description === undefined ? undefined : dto.description || null,
          type: dto.type,
          status: dto.status,
          price: dto.price,
          costPrice: dto.costPrice,
          lowStockThreshold: dto.lowStockThreshold,
          size: dto.size === undefined ? undefined : dto.size || null,
          careLevel:
            dto.careLevel === undefined ? undefined : dto.careLevel || null,
          temperatureRange:
            dto.temperatureRange === undefined
              ? undefined
              : dto.temperatureRange || null,
          images: images === undefined
            ? undefined
            : {
                deleteMany: {},
                create: images.map((image, index) => ({
                  url: image.url,
                  altText: image.altText || dto.name || current.name,
                  position: image.position ?? index,
                  isPrimary: this.isPrimaryImage(images, index),
                })),
              },
        },
        include: PRODUCT_RELATIONS,
      });
      return this.serialize(product);
    } catch (error: unknown) {
      this.rethrowWriteError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Không tìm thấy sản phẩm");

    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error: unknown) {
      if (this.isPrismaError(error, "P2003")) {
        throw new ConflictException(
          "Sản phẩm đã phát sinh đơn hàng hoặc giao dịch kho; hãy chuyển trạng thái sang ngừng hoạt động",
        );
      }
      throw error;
    }
  }

  private async list(
    where: Prisma.ProductWhereInput,
    query: ProductQueryDto,
  ): Promise<{ data: ProductResponse[]; meta: PaginationMeta }> {
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_RELATIONS,
        orderBy: this.orderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  private buildWhere(
    query: ProductQueryDto,
    storefront: boolean,
  ): Prisma.ProductWhereInput {
    return {
      ...(storefront ? { status: ProductStatus.ACTIVE } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.minPrice || query.maxPrice
        ? {
            price: {
              ...(query.minPrice
                ? { gte: new Prisma.Decimal(query.minPrice) }
                : {}),
              ...(query.maxPrice
                ? { lte: new Prisma.Decimal(query.maxPrice) }
                : {}),
            },
          }
        : {}),
      ...(query.inStock === true ? { stockQuantity: { gt: 0 } } : {}),
      ...(query.inStock === false ? { stockQuantity: { lte: 0 } } : {}),
      ...(query.categorySlug || storefront
        ? {
            category: {
              ...(query.categorySlug
                ? { slug: toSlug(query.categorySlug) }
                : {}),
              ...(storefront ? { isActive: true } : {}),
            },
          }
        : {}),
    };
  }

  private orderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return [{ price: "asc" }, { id: "asc" }];
      case ProductSort.PRICE_DESC:
        return [{ price: "desc" }, { id: "asc" }];
      case ProductSort.NAME_ASC:
        return [{ name: "asc" }, { id: "asc" }];
      case ProductSort.NEWEST:
      default:
        return [{ createdAt: "desc" }, { id: "desc" }];
    }
  }

  private validatePriceRange(minPrice?: string, maxPrice?: string): void {
    if (
      minPrice &&
      maxPrice &&
      new Prisma.Decimal(minPrice).greaterThan(new Prisma.Decimal(maxPrice))
    ) {
      throw new BadRequestException("minPrice không được lớn hơn maxPrice");
    }
  }

  private validateImages(images: CreateProductDto["images"]): void {
    if ((images?.filter((image) => image.isPrimary).length ?? 0) > 1) {
      throw new BadRequestException("Chỉ được chọn một ảnh đại diện");
    }
  }

  private isPrimaryImage(
    images: NonNullable<CreateProductDto["images"]>,
    index: number,
  ): boolean {
    const selectedIndex = images.findIndex((image) => image.isPrimary);
    return selectedIndex === -1 ? index === 0 : selectedIndex === index;
  }

  private async getCategory(
    id: string,
  ): Promise<{ id: string; isActive: boolean }> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!category) throw new BadRequestException("Danh mục không tồn tại");
    return category;
  }

  private serialize(product: ProductWithRelations): ProductResponse {
    return {
      id: product.id,
      categoryId: product.categoryId,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      description: product.description,
      type: product.type,
      status: product.status,
      price: product.price.toFixed(2),
      costPrice: product.costPrice?.toFixed(2) ?? null,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      size: product.size,
      careLevel: product.careLevel,
      temperatureRange: product.temperatureRange,
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },
      images: [...product.images]
        .sort((left, right) => left.position - right.position)
        .map((image) => ({
          id: image.id,
          url: image.url,
          altText: image.altText,
          position: image.position,
          isPrimary: image.isPrimary,
        })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private serializePublic(product: ProductResponse): PublicProductResponse {
    return {
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      type: product.type,
      price: product.price,
      inStock: product.stockQuantity > 0,
      availableQuantity: product.stockQuantity,
      category: product.category,
      images: product.images,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private rethrowWriteError(error: unknown): never {
    if (this.isPrismaError(error, "P2002")) {
      throw new ConflictException("SKU hoặc slug sản phẩm đã tồn tại");
    }
    if (this.isPrismaError(error, "P2003")) {
      throw new BadRequestException("Danh mục không tồn tại");
    }
    throw error;
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
