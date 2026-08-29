import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaginationMeta } from "../../common/dto/pagination.dto.js";
import { Public } from "../auth/decorators/public.decorator.js";
import { ProductQueryDto } from "./dto/product-query.dto.js";
import {
  ProductsService,
  type PublicProductResponse,
} from "./products.service.js";

@Public()
@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: "Browse active storefront products" })
  list(@Query() query: ProductQueryDto): Promise<{
    data: PublicProductResponse[];
    meta: PaginationMeta;
  }> {
    return this.products.listPublic(query);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get an active product by slug" })
  getBySlug(@Param("slug") slug: string): Promise<PublicProductResponse> {
    return this.products.getPublicBySlug(slug);
  }
}
