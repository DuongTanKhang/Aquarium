import { Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../auth/types/auth.types.js";
import { FavoritesService } from "./favorites.service.js";

@ApiTags("favorites")
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: "List the signed-in customer's favorites" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.list(user.userId);
  }

  @Post(":productId")
  @ApiOperation({ summary: "Save a product to favorites" })
  add(@CurrentUser() user: AuthenticatedUser, @Param("productId", ParseUUIDPipe) productId: string) {
    return this.favorites.add(user.userId, productId);
  }

  @Delete(":productId")
  @ApiOperation({ summary: "Remove a product from favorites" })
  remove(@CurrentUser() user: AuthenticatedUser, @Param("productId", ParseUUIDPipe) productId: string) {
    return this.favorites.remove(user.userId, productId);
  }
}
