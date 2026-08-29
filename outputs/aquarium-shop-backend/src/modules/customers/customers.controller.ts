import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { CustomersService } from "./customers.service.js";
import { CustomerQueryDto } from "./dto/customer-query.dto.js";

@ApiTags("admin-customers")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: "List customers with order totals" })
  list(@Query() query: CustomerQueryDto) {
    return this.customers.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a customer and lifetime order totals" })
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.customers.getById(id);
  }
}
