import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ReturnRequestStatus } from "../../../generated/prisma/enums.js";

export class UpdateReturnRequestDto {
  @ApiProperty({ enum: ReturnRequestStatus })
  @IsEnum(ReturnRequestStatus)
  status!: ReturnRequestStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;

  @ApiPropertyOptional({ description: "Provider's refund reference; required for a REFUNDED transition." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerRefundId?: string;
}
