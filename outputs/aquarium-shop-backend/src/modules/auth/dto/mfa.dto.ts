import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class MfaCodeDto {
  @ApiProperty({ example: "123456", description: "TOTP or recovery code" })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

export class MfaLoginDto extends MfaCodeDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  mfaTicket!: string;
}

export class DisableMfaDto extends MfaCodeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
