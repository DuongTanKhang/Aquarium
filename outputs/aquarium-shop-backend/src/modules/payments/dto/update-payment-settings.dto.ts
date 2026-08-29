import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsString, ValidateNested } from "class-validator";

// Keep checkout methods explicit. Card stays disabled until a PCI-compliant
// hosted processor is configured; PayPal and cash on delivery are supported.
export const PAYMENT_METHOD_IDS = ["CARD", "PAYPAL", "COD"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export class PaymentMethodToggleDto {
  @IsString()
  @IsIn(PAYMENT_METHOD_IDS)
  id!: PaymentMethodId;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePaymentSettingsDto {
  @IsString()
  @IsIn(["USD"])
  currency!: "USD";

  @IsString()
  @IsIn(PAYMENT_METHOD_IDS)
  defaultMethod!: PaymentMethodId;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodToggleDto)
  methods!: PaymentMethodToggleDto[];
}
