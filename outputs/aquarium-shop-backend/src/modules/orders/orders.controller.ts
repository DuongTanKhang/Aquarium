import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../auth/types/auth.types.js";
import { OrdersService } from "./orders.service.js";
import { OrderQueryDto } from "./dto/order-query.dto.js";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto.js";
import { CreateOrderDto } from "./dto/create-order.dto.js";
import { LookupOrderDto } from "./dto/lookup-order.dto.js";
import { Public } from "../auth/decorators/public.decorator.js";

@ApiTags("admin-orders")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: "List orders for the sales workspace" })
  list(@Query() query: OrderQueryDto) {
    return this.orders.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an order with line items and payment" })
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.orders.getById(id);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Move an order through its fulfillment workflow" })
  updateStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.updateStatus(id, dto, user.userId);
  }
}

@ApiTags("storefront-orders")
@Controller("orders")
export class PublicOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @Roles()
  @Post("lookup")
  @ApiOperation({ summary: "Look up a guest order using its order number and checkout email" })
  lookup(@Body() dto: LookupOrderDto) {
    return this.orders.lookupPublic(dto);
  }

  @Get("mine")
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the signed-in customer's own orders and tracking history" })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.listMine(user.userId);
  }

  @Post()
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Place a customer storefront order with server-side price and stock checks" })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.orders.createPublic(dto, user.userId, idempotencyKey);
  }
}
