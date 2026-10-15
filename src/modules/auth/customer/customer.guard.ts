import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { authenticateRequest } from '../sessions/session.guard.js';
import { SessionService } from '../sessions/session.service.js';

// Una cuenta borrada ya no tiene sesiones, pero se chequea igual.
@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth = await authenticateRequest(this.sessions, 'customer', context);
    const customer = await this.prisma.customer.findUnique({
      where: { id: auth.ownerId },
      select: { deletedAt: true },
    });
    if (!customer || customer.deletedAt) {
      const http = context.switchToHttp();
      await this.sessions.end(
        'customer',
        http.getRequest<Request>(),
        http.getResponse<Response>(),
      );
      throw new AppException('UNAUTHENTICATED');
    }
    return true;
  }
}

export const CustomerOnly = () => UseGuards(CustomerGuard);
