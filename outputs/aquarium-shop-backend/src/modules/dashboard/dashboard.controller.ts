import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../generated/prisma/enums.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { DashboardService, type DashboardSummary } from "./dashboard.service.js";

@ApiTags("admin-dashboard")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  @ApiOperation({ summary: "Get the main admin dashboard counters" })
  getSummary(): Promise<DashboardSummary> {
    return this.dashboardService.getSummary();
  }

  @Get("analytics")
  @ApiOperation({ summary: "Get sales trend, category mix, and top products" })
  getAnalytics(@Query("days") days?: string) {
    return this.dashboardService.getAnalytics(days ? Number(days) : 30);
  }
}
