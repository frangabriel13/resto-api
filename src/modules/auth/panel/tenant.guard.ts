import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import type { TenantRequest } from '../../../common/tenant/tenant-transaction.interceptor.js';
import type { StaffRole } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../sessions/session.guard.js';

const ROLES = 'roles';

export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES, roles);

// Va después de StaffGuard, que deja la sesión en req.auth.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & TenantRequest>();
    const session = await this.prisma.staffSession.findUnique({
      where: { id: req.auth.sessionId },
      select: {
        selectedMerchant: {
          select: {
            merchantId: true,
            role: true,
            active: true,
            merchant: { select: { status: true, stampCooldownMinutes: true } },
          },
        },
      },
    });
    const membership = session?.selectedMerchant;
    if (!membership) throw new AppException('MERCHANT_NOT_SELECTED');
    if (!membership.active) throw new AppException('MERCHANT_ACCESS_REVOKED');

    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(
      ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (roles && !roles.includes(membership.role)) {
      throw new AppException('FORBIDDEN');
    }

    req.tenant = {
      merchantId: membership.merchantId,
      merchantStatus: membership.merchant.status,
      stampCooldownMinutes: membership.merchant.stampCooldownMinutes,
      staffUserId: req.auth.ownerId,
      role: membership.role,
    };
    return true;
  }
}
