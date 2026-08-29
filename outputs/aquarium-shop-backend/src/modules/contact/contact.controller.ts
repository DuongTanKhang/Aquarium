import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator.js";
import { EmailService } from "../auth/email.service.js";
import { CreateContactMessageDto } from "./dto/create-contact-message.dto.js";

@Public()
@ApiTags("contact")
@Controller("contact")
export class ContactController {
  constructor(private readonly email: EmailService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: "Send a customer contact message" })
  async create(@Body() dto: CreateContactMessageDto): Promise<{ message: string }> {
    await this.email.sendContactMessage(dto.name, dto.email, dto.topic, dto.message);
    return { message: "Your message has been sent" };
  }
}
