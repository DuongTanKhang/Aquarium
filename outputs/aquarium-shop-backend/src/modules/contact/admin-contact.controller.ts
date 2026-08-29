import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContactMessageStatus, UserRole } from "../../generated/prisma/enums.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { ContactService } from "./contact.service.js";
import { UpdateContactStatusDto } from "./dto/update-contact-status.dto.js";

@ApiTags("admin-contact")
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller("admin/contact-messages")
export class AdminContactController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  @ApiOperation({ summary: "List persisted customer contact messages" })
  list() {
    return this.contact.listMessages();
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update a contact message status" })
  updateStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateContactStatusDto) {
    return this.contact.updateStatus(id, dto.status as ContactMessageStatus);
  }
}
