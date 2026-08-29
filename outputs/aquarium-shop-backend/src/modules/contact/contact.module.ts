import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ContactController } from "./contact.controller.js";
import { ContactService } from "./contact.service.js";
import { AdminContactController } from "./admin-contact.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [ContactController, AdminContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
