import { Module } from "@nestjs/common";
import { OrdersController, PublicOrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({ imports: [AuthModule], controllers: [OrdersController, PublicOrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
