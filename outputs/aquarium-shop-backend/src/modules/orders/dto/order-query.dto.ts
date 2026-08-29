import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, Matches } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination.dto.js";
import { OrderStatus } from "../../../generated/prisma/enums.js";

export class OrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ format: "date", example: "2026-08-28", description: "Inclusive start date in YYYY-MM-DD format" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "fromDate must use YYYY-MM-DD format" })
  fromDate?: string;

  @ApiPropertyOptional({ format: "date", example: "2026-08-28", description: "Inclusive end date in YYYY-MM-DD format" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "toDate must use YYYY-MM-DD format" })
  toDate?: string;
}
