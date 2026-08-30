import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnvironment } from "./common/config/environment.js";
import { PrismaModule } from "./database/prisma.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CategoriesModule } from "./modules/categories/categories.module.js";
import { CustomersModule } from "./modules/customers/customers.module.js";
import { ContactModule } from "./modules/contact/contact.module.js";
import { FavoritesModule } from "./modules/favorites/favorites.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { MediaModule } from "./modules/media/media.module.js";
import { OrdersModule } from "./modules/orders/orders.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { ReturnsModule } from "./modules/returns/returns.module.js";
import { ProductsModule } from "./modules/products/products.module.js";
import { UsersModule } from "./modules/users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        name: "default",
        ttl: config.get<number>("THROTTLE_GLOBAL_TTL_MS", 60_000),
        limit: config.get<number>("THROTTLE_GLOBAL_LIMIT", 600),
        blockDuration: config.get<number>("THROTTLE_BLOCK_DURATION_MS", 5_000),
      }],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    ContactModule,
    FavoritesModule,
    OrdersModule,
    PaymentsModule,
    ReturnsModule,
    MediaModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
