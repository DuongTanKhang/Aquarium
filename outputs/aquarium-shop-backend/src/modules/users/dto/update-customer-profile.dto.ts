import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

function trim({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeUSPhone({ value }: TransformFnParams): unknown {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? `+1${national}` : value.trim();
}

export class UpdateCustomerProfileDto {
  @ApiProperty({ example: "Alex Morgan" })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiPropertyOptional({ example: "+1 415 555 0123" })
  @Transform(normalizeUSPhone)
  @IsOptional()
  @IsString()
  @Matches(/^\+1[2-9]\d{2}[2-9]\d{6}$/, { message: "phone must be a valid US phone number" })
  phone?: string;

  @ApiPropertyOptional({ example: "120 Ocean Avenue, Miami, FL 33101" })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(240)
  address?: string;

  @ApiPropertyOptional({ maxLength: 900000, description: "Compressed PNG/JPEG/WebP data URL or HTTPS image URL" })
  @IsOptional()
  @IsString()
  @MaxLength(900000)
  @Matches(/^(?:data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+|https?:\/\/\S+)$/i, { message: "avatarUrl must be a safe image URL or encoded PNG/JPEG/WebP image" })
  avatarUrl?: string | null;
}
