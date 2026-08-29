import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { User } from "../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma.service.js";
import { PublicUser } from "../auth/types/auth.types.js";
import { UpdateCustomerProfileDto } from "./dto/update-customer-profile.dto.js";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateCustomerProfile(userId: string, dto: UpdateCustomerProfileDto): Promise<PublicUser> {
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, phone: true } });
    if (!current) throw new NotFoundException("Customer account not found");
    if (current.role !== "CUSTOMER") throw new BadRequestException("Only customer accounts can update this profile");
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName.trim(),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.phone !== undefined && dto.phone.trim() !== (current.phone ?? "") ? { phoneVerifiedAt: null } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl?.trim() || null } : {}),
      },
    });
    return this.toPublicUser(updated);
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      address: user.address,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
    };
  }
}
