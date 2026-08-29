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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaginationMeta } from "../../common/dto/pagination.dto.js";
import { UserRole } from "../../generated/prisma/enums.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { AdminProductQueryDto } from "./dto/product-query.dto.js";
import { UpdateProductDto } from "./dto/update-product.dto.js";
import { ProductsService, type ProductResponse } from "./products.service.js";

@ApiTags("admin-products")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/products")
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: "List all products for management" })
  list(@Query() query: AdminProductQueryDto): Promise<{
    data: ProductResponse[];
    meta: PaginationMeta;
  }> {
    return this.products.listAdmin(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a product by id" })
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.getAdminById(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a product and its initial images" })
  create(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.products.create(dto);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update product metadata; stock changes use inventory endpoints",
  })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.products.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a product that has no business history" })
  remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.products.remove(id);
  }
}
