import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  ValidateNested,
} from "class-validator";
import { ProductStatus, ProductType } from "../../../generated/prisma/enums.js";

const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

function trim({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : undefined;
}

function moneyString({ value }: TransformFnParams): unknown {
  if (typeof value === "number") return value.toString();
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Product images can be hosted URLs or compressed browser uploads. SVG/data
 * URLs are deliberately excluded so an uploaded image can never inject markup
 * when rendered by the customer storefront.
 */
@ValidatorConstraint({ name: "isProductImageUrl", async: false })
class ProductImageUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string") return false;
    if (/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(value)) {
      return value.length <= 900_000;
    }
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "Image must be a valid http(s) URL or an encoded PNG/JPEG/WebP image";
  }
}

export class CreateProductImageDto {
  @ApiProperty({ example: "https://cdn.example.com/products/neon-tetra.jpg" })
  @Transform(trim)
  @IsString()
  @Validate(ProductImageUrlConstraint)
  @MaxLength(900000)
  url!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: "FISH-NEON-001" })
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/)
  sku!: string;

  @ApiProperty({ example: "Cá Neon vua" })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: "ca-neon-vua" })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type!: ProductType;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ example: "14.00", description: "USD decimal string" })
  @Transform(moneyString)
  @IsString()
  @Matches(MONEY_PATTERN)
  price!: string;

  @ApiPropertyOptional({ example: "18000.00" })
  @Transform(moneyString)
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  costPrice?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ default: 5, minimum: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  size?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  careLevel?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  temperatureRange?: string;

  @ApiPropertyOptional({ type: [CreateProductImageDto], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];
}
