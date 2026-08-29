import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { ReturnRequestType } from "../../../generated/prisma/enums.js";

export class CreateReturnRequestDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: ReturnRequestType, example: ReturnRequestType.REFUND })
  @IsEnum(ReturnRequestType)
  type!: ReturnRequestType;

  @ApiProperty({ example: "The fish arrived in poor condition." })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
