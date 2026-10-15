import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { authenticateRequest } from '../sessions/session.guard.js';
import { SessionService } from '../sessions/session.service.js';

const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth = await authenticateRequest(this.sessions, 'staff', context);
    const user = await this.prisma.staffUser.findUnique({
      where: { id: auth.ownerId },
      select: { mustChangePassword: true },
    });
    if (!user) throw new AppException('UNAUTHENTICATED');

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE,
      [context.getHandler(), context.getClass()],
    );
    if (user.mustChangePassword && !allowPending) {
      throw new AppException('PASSWORD_CHANGE_REQUIRED');
    }
    return true;
  }
}
