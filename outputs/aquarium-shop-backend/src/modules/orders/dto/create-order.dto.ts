import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from "class-validator";

export const CHECKOUT_PAYMENT_METHODS = [
  "CARD",
  "PAYPAL",
] as const;

export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

function trim({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateOrderItemDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 50, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: "Alex Morgan" })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName!: string;

  @ApiProperty({ example: "alex@example.com" })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  customerEmail!: string;

  @ApiProperty({ example: "+1 415 555 0123" })
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9() .-]{7,24}$/)
  customerPhone!: string;

  @ApiProperty({ example: "120 Ocean Avenue, Miami, FL 33101" })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  shippingAddress!: string;

  @ApiPropertyOptional({ example: "Please call before delivery." })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ enum: CHECKOUT_PAYMENT_METHODS, example: "CARD" })
  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod!: CheckoutPaymentMethod;

  @ApiProperty({ type: [CreateOrderItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
