import { Transform, type TransformFnParams } from "class-transformer";
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";

function trim({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export const CONTACT_TOPICS = ["care", "order", "product", "other"] as const;

export class CreateContactMessageDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(CONTACT_TOPICS)
  topic!: (typeof CONTACT_TOPICS)[number];

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
