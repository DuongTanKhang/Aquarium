import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateProductDto } from "./create-product.dto.js";

class ProductEditableFields extends OmitType(CreateProductDto, [
  "stockQuantity",
] as const) {}

export class UpdateProductDto extends PartialType(ProductEditableFields) {}
