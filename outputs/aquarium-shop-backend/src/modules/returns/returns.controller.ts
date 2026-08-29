import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../auth/types/auth.types.js";
import { CreateReturnRequestDto } from "./dto/create-return-request.dto.js";
import { UpdateReturnRequestDto } from "./dto/update-return-request.dto.js";
import { ReturnsService } from "./returns.service.js";

@ApiTags("customer-returns")
@ApiBearerAuth()
@Controller("returns")
export class CustomerReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: "Request a refund, return or exchange for a paid order" })
  create(@Body() dto: CreateReturnRequestDto, @CurrentUser() user: AuthenticatedUser) { return this.returns.create(user.userId, dto); }

  @Get("mine")
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: "List the signed-in customer's return requests" })
  mine(@CurrentUser() user: AuthenticatedUser) { return this.returns.listMine(user.userId); }
}

@ApiTags("admin-returns")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/returns")
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: "List refund and return requests" })
  list() { return this.returns.listAdmin(); }

  @Patch(":id")
  @ApiOperation({ summary: "Review or resolve a refund/return request" })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateReturnRequestDto, @CurrentUser() user: AuthenticatedUser) { return this.returns.update(id, dto, user.userId); }
}
