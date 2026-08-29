import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../database/prisma.service.js";
import { Public } from "../auth/decorators/public.decorator.js";

@Public()
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Check whether the API is running" })
  check(): { status: string; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  @ApiOperation({ summary: "Check whether the API and database are ready" })
  async ready(): Promise<{ status: string; timestamp: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ready",
        timestamp: new Date().toISOString(),
      };
    } catch {
      // Keep readiness responses generic; orchestration only needs the status
      // code and must not receive database connection details.
      throw new ServiceUnavailableException("Service is not ready");
    }
  }
}
