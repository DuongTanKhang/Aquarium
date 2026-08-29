import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsString, ValidateNested } from "class-validator";

// Keep the store checkout intentionally small and predictable: customers can
// pay by card or through PayPal only. Provider-specific wallets/bank rails are
// not exposed or accepted by the API.
export const PAYMENT_METHOD_IDS = ["CARD", "PAYPAL"] as const;
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
