import { Module } from "@nestjs/common";
import { UsersService } from "./users.service.js";
import { CustomerAccountController } from "./customer-account.controller.js";

@Module({
  controllers: [CustomerAccountController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
