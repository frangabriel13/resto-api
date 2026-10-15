import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  hashPassword,
  verifyCredentialPassword,
  verifyPassword,
} from '../../../common/passwords.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuthSession } from '../sessions/session-kinds.js';
import { SessionService } from '../sessions/session.service.js';
import type { StaffAccount } from './staff-auth.schemas.js';

const activeMemberships = {
  memberships: {
    where: { active: true },
    include: {
      merchant: {
        include: {
          rewardRules: { where: { active: true }, select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

type UserWithMemberships = Prisma.StaffUserGetPayload<{
  include: typeof activeMemberships;
}>;

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async login(
    email: string,
    password: string,
    req: Request,
    res: Response,
  ): Promise<StaffAccount> {
    const user = await this.verifyCredentials(email, password);
    const session = await this.sessions.start('staff', user.id, req, res);
    const [onlyMembership, ...others] = user.memberships;
    if (onlyMembership && others.length === 0) {
      await this.saveSelection(session, onlyMembership.merchantId);
    }
    return this.getAccount(session);
  }

  async getAccount(session: AuthSession): Promise<StaffAccount> {
    const user = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: session.ownerId },
      include: activeMemberships,
    });
    const { selectedMerchantId } =
      await this.prisma.staffSession.findUniqueOrThrow({
        where: { id: session.sessionId },
      });
    return toAccount(user, selectedMerchantId);
  }

  async selectMerchant(
    session: AuthSession,
    merchantId: string,
  ): Promise<StaffAccount> {
    const membership = await this.prisma.staffMembership.findUnique({
      where: {
        staffUserId_merchantId: { staffUserId: session.ownerId, merchantId },
      },
    });
    if (!membership?.active) {
      throw new AppException('FORBIDDEN', 'No tenés acceso a ese comercio.');
    }
    await this.saveSelection(session, merchantId);
    return this.getAccount(session);
  }

  async changePassword(
    staffUserId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staffUserId },
    });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppException('CURRENT_PASSWORD_INCORRECT');
    }
    await this.prisma.staffUser.update({
      where: { id: staffUserId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    });
  }

  private async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserWithMemberships> {
    const user = await this.prisma.staffUser.findUnique({
      where: { email },
      include: activeMemberships,
    });
    const valid = await verifyCredentialPassword(user?.passwordHash, password);
    if (!user || !valid) throw new AppException('INVALID_CREDENTIALS');
    if (user.memberships.length === 0) {
      throw new AppException('NO_ACTIVE_MERCHANT');
    }
    return user;
  }

  private async saveSelection(session: AuthSession, merchantId: string) {
    await this.prisma.staffSession.update({
      where: { id: session.sessionId },
      data: { selectedMerchantId: merchantId },
    });
  }
}

function toAccount(
  user: UserWithMemberships,
  selectedMerchantId: string | null,
): StaffAccount {
  const merchants = user.memberships.map(({ role, merchant }) => ({
    id: merchant.id,
    name: merchant.name,
    slug: merchant.slug,
    status: merchant.status,
    hasActiveRule: merchant.rewardRules.length > 0,
    role,
  }));
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    },
    merchants,
    // Si lo dieron de baja del comercio elegido, la selección ya no vale.
    selectedMerchantId: merchants.some((m) => m.id === selectedMerchantId)
      ? selectedMerchantId
      : null,
  };
}
