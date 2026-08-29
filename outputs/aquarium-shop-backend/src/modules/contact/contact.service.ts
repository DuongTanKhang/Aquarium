import { Injectable, Logger } from "@nestjs/common";
import { ContactMessageStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma.service.js";
import { EmailService } from "../auth/email.service.js";
import { CreateContactMessageDto } from "./dto/create-contact-message.dto.js";

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async createMessage(dto: CreateContactMessageDto): Promise<{ message: string }> {
    await this.prisma.contactMessage.create({
      data: { name: dto.name, email: dto.email, topic: dto.topic, message: dto.message },
    });
    try {
      await this.email.sendContactMessage(dto.name, dto.email, dto.topic, dto.message);
    } catch (error) {
      // The message is safely persisted even if SMTP is temporarily down.
      this.logger.error("Contact notification email failed", error instanceof Error ? error.stack : String(error));
    }
    return { message: "Your message has been sent" };
  }

  async subscribe(email: string): Promise<{ message: string }> {
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email },
      update: { unsubscribedAt: null, subscribedAt: new Date() },
    });
    return { message: "You are on the list" };
  }

  listMessages(status?: ContactMessageStatus) {
    return this.prisma.contactMessage.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
  }

  updateStatus(id: string, status: ContactMessageStatus) {
    return this.prisma.contactMessage.update({ where: { id }, data: { status } });
  }
}
