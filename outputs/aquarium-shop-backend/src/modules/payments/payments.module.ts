import { Module } from "@nestjs/common";
import { PayPalController, PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { OrdersModule } from "../orders/orders.module.js";

@Module({ imports: [OrdersModule], controllers: [PaymentsController, PayPalController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
