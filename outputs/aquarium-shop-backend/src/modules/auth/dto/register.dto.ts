import { Transform, TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : (value as unknown);
}

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : (value as unknown);
}

function normalizeUSPhone({ value }: TransformFnParams): unknown {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? `+1${national}` : value.trim();
}

export class RegisterDto {
  @ApiProperty({ example: "customer@example.com" })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: "Nguyễn Minh Anh" })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({ example: "+1 415 555 0123", description: "US NANP phone number" })
  @Transform(normalizeUSPhone)
  @IsString()
  @Matches(/^\+1[2-9]\d{2}[2-9]\d{6}$/, { message: "phone must be a valid US phone number" })
  phone!: string;
}
