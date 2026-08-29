import { UserRole } from "../../../generated/prisma/enums.js";

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
  role: UserRole;
  typ: "access";
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: Date | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  mfaEnabled: boolean;
  createdAt: Date;
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: PublicUser;
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface MfaPendingResult {
  mfaRequired: true;
  mfaTicket: string;
  expiresIn: number;
}

export interface MfaTicketPayload {
  sub: string;
  cid: string;
  typ: "mfa";
}
