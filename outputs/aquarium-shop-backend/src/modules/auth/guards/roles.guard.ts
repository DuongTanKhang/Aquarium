import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import { AuthenticatedUser } from "../types/auth.types.js";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user || !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException("Bạn không có quyền thực hiện thao tác này");
    }

    const requireAdminMfa = this.config.get<boolean>("REQUIRE_ADMIN_MFA", false);

    if (
      requireAdminMfa &&
      request.user.role === UserRole.ADMIN &&
      requiredRoles.includes(UserRole.ADMIN) &&
      !request.user.mfaEnabled
    ) {
      throw new ForbiddenException(
        "Tài khoản quản trị phải bật MFA trước khi truy cập dashboard",
      );
    }

    return true;
  }
}
