import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { InventoryTransactionType } from "../../../generated/prisma/enums.js";

export class AdjustInventoryDto {
  @ApiProperty({ enum: InventoryTransactionType })
  @IsEnum(InventoryTransactionType)
  type!: InventoryTransactionType;

  @ApiProperty({ description: "Positive for import/return; adjustment may be negative" })
  @IsInt()
  @Min(-100000)
  @Max(100000)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
