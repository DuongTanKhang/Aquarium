import { ApiProperty } from "@nestjs/swagger";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

function trim({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class LookupOrderDto {
  @ApiProperty({ example: "alex@example.com" })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: "AQ-MD1AB2CD-7F3K9Q" })
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  orderNumber!: string;
}
