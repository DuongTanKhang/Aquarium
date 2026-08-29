import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator.js";
import { ContactService } from "./contact.service.js";
import { CreateContactMessageDto } from "./dto/create-contact-message.dto.js";
import { SubscribeNewsletterDto } from "./dto/subscribe-newsletter.dto.js";

@Public()
@ApiTags("contact")
@Controller("contact")
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: "Send a customer contact message" })
  async create(@Body() dto: CreateContactMessageDto): Promise<{ message: string }> {
    return this.contact.createMessage(dto);
  }

  @Post("newsletter")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiOperation({ summary: "Subscribe an email to the store newsletter" })
  subscribe(@Body() dto: SubscribeNewsletterDto): Promise<{ message: string }> {
    return this.contact.subscribe(dto.email);
  }
}
