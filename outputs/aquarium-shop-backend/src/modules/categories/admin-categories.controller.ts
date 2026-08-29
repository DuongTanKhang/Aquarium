import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { PaginationMeta } from "../../common/dto/pagination.dto.js";
import { UserRole } from "../../generated/prisma/enums.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import {
  CategoriesService,
  type CategoryResponse,
} from "./categories.service.js";
import { AdminCategoryQueryDto } from "./dto/category-query.dto.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { UpdateCategoryDto } from "./dto/update-category.dto.js";

@ApiTags("admin-categories")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: "List all categories for management" })
  list(@Query() query: AdminCategoryQueryDto): Promise<{
    data: CategoryResponse[];
    meta: PaginationMeta;
  }> {
    return this.categories.listAdmin(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a category by id" })
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<CategoryResponse> {
    return this.categories.getAdminById(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a category" })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categories.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a category" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categories.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a category; optionally remove products without business history" })
  @ApiQuery({ name: "cascade", required: false, type: Boolean, description: "Also delete products that have no order or inventory history" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("cascade") cascade?: string,
  ): Promise<void> {
    return this.categories.remove(id, cascade === "true");
  }
}
