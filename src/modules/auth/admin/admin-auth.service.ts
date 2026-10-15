import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../../../common/errors/app.exception.js';
import { verifyCredentialPassword } from '../../../common/passwords.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { SessionService } from '../sessions/session.service.js';
import type { AdminAccount } from './admin-auth.schemas.js';

const accountSelect = { id: true, name: true, email: true } as const;

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly sessions: SessionService,
  ) {}

  async login(
    email: string,
    password: string,
    req: Request,
    res: Response,
  ): Promise<AdminAccount> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email },
    });
    const valid = await verifyCredentialPassword(admin?.passwordHash, password);
    if (!admin || !valid) throw new AppException('INVALID_CREDENTIALS');
    await this.sessions.start('admin', admin.id, req, res);
    return { id: admin.id, name: admin.name, email: admin.email };
  }

  getAccount(platformAdminId: string): Promise<AdminAccount> {
    return this.prisma.platformAdmin.findUniqueOrThrow({
      where: { id: platformAdminId },
      select: accountSelect,
    });
  }
}
