import { Body, Controller, Get, NotFoundException, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../auth/types/auth.types.js";
import { UpdateCustomerProfileDto } from "./dto/update-customer-profile.dto.js";
import { UsersService } from "./users.service.js";

@ApiTags("customer-account")
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller("account")
export class CustomerAccountController {
  constructor(private readonly users: UsersService) {}

  @Get("profile")
  @ApiOperation({ summary: "Get the signed-in customer's own profile" })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findById(user.userId).then((account) => {
      if (!account || account.role !== UserRole.CUSTOMER) throw new NotFoundException("Customer account not found");
      return this.users.toPublicUser(account);
    });
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update the signed-in customer's own profile" })
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCustomerProfileDto) {
    return this.users.updateCustomerProfile(user.userId, dto);
  }
}
