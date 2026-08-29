import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination.dto.js";

export class InventoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: 5, minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  threshold = 5;
}
