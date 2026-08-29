import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator.js";
import {
  CategoriesService,
  type CategoryResponse,
} from "./categories.service.js";
import { PublicCategoryQueryDto } from "./dto/category-query.dto.js";
import type { PaginationMeta } from "../../common/dto/pagination.dto.js";

@Public()
@ApiTags("categories")
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: "List active storefront categories" })
  list(@Query() query: PublicCategoryQueryDto): Promise<{
    data: CategoryResponse[];
    meta: PaginationMeta;
  }> {
    return this.categories.listPublic(query);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get an active category by slug" })
  getBySlug(@Param("slug") slug: string): Promise<CategoryResponse> {
    return this.categories.getPublicBySlug(slug);
  }
}
