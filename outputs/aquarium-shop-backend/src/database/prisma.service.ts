import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const logger = new Logger(PrismaService.name);
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      max: config.get<number>("DATABASE_POOL_MAX", 10),
      connectionTimeoutMillis: config.get<number>(
        "DATABASE_CONNECTION_TIMEOUT_MS",
        5_000,
      ),
      idleTimeoutMillis: config.get<number>(
        "DATABASE_IDLE_TIMEOUT_MS",
        30_000,
      ),
    }, {
      onPoolError: (error) => {
        logger.error(`PostgreSQL pool error: ${error.message}`);
      },
    });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
