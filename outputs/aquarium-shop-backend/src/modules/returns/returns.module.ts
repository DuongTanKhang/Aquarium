import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { CustomerReturnsController, AdminReturnsController } from "./returns.controller.js";
import { ReturnsService } from "./returns.service.js";

@Module({ imports: [AuthModule, PaymentsModule], controllers: [CustomerReturnsController, AdminReturnsController], providers: [ReturnsService], exports: [ReturnsService] })
export class ReturnsModule {}
