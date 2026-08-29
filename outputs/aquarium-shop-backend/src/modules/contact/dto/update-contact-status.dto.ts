import { IsEnum } from "class-validator";
import { ContactMessageStatus } from "../../../generated/prisma/enums.js";

export class UpdateContactStatusDto {
  @IsEnum(ContactMessageStatus)
  status!: ContactMessageStatus;
}
