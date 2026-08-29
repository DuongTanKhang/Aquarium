import { ApiProperty } from "@nestjs/swagger";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : (value as unknown);
}

export class EmailRequestDto {
  @ApiProperty({ example: "customer@example.com" })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(256)
  token!: string;
}

export class ResetPasswordDto extends VerifyEmailDto {
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
