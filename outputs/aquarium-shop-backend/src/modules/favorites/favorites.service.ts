import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { ProductStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";

const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export interface FavoriteProductResponse {
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
  images: Array<{ id: string; url: string; altText: string | null; position: number; isPrimary: boolean }>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<FavoriteProductResponse[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, product: { status: ProductStatus.ACTIVE, category: { isActive: true } } },
      include: { product: { include: PRODUCT_INCLUDE } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => this.serialize(row.product));
  }

  async add(userId: string, productId: string): Promise<FavoriteProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE, category: { isActive: true } },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException("Product is no longer available");

    await this.prisma.favorite.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
    return this.serialize(product);
  }

  async remove(userId: string, productId: string): Promise<{ removed: boolean }> {
    const result = await this.prisma.favorite.deleteMany({ where: { userId, productId } });
    return { removed: result.count > 0 };
  }

  private serialize(product: ProductWithRelations): FavoriteProductResponse {
    return {
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      type: product.type,
      price: product.price.toFixed(2),
      inStock: product.stockQuantity > 0,
      availableQuantity: product.stockQuantity,
      category: { id: product.category.id, name: product.category.name, slug: product.category.slug },
      images: [...product.images].sort((left, right) => left.position - right.position).map((image) => ({
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
}
