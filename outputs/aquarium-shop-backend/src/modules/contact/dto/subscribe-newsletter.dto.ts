import { Transform, type TransformFnParams } from "class-transformer";
import { IsEmail, MaxLength } from "class-validator";

function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class SubscribeNewsletterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
