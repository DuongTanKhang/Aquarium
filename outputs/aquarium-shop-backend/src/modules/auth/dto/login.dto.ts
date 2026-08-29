import { Transform, TransformFnParams } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : (value as unknown);
}

export class LoginDto {
  @ApiProperty({ example: "admin@aquarium.local" })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
