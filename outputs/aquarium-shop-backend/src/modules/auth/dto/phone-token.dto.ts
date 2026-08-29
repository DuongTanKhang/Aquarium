import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class VerifyPhoneDto {
  @ApiProperty({ example: "123456", description: "Six-digit SMS verification code" })
  @IsString()
  @Matches(/^\d{6}$/, { message: "code must be exactly 6 digits" })
  code!: string;
}
