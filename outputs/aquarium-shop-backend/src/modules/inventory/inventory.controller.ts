import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../auth/types/auth.types.js";
import { InventoryService } from "./inventory.service.js";
import { InventoryQueryDto } from "./dto/inventory-query.dto.js";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto.js";

@ApiTags("admin-inventory")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("low-stock")
  @ApiOperation({ summary: "List products at or below the stock threshold" })
  listLowStock(@Query() query: InventoryQueryDto) {
    return this.inventory.listLowStock(query);
  }

  @Post(":productId/adjust")
  @ApiOperation({ summary: "Apply an auditable stock adjustment" })
  adjust(@Param("productId", ParseUUIDPipe) productId: string, @Body() dto: AdjustInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.adjust(productId, dto, user.userId);
  }
}
