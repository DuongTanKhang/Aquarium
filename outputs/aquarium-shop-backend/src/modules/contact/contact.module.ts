import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ContactController } from "./contact.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [ContactController],
})
export class ContactModule {}
