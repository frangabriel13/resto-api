import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../../common/errors/app.exception.js';
import { hashPassword } from '../../../../common/passwords.js';
import { runWithSetting } from '../../../../common/request-scope/scoped-transaction.js';
import { generateToken, hashToken } from '../../../../common/tokens.js';
import type { Env } from '../../../../config/env.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { EMAIL_SENDER, type EmailSender } from '../../../email/email-sender.js';
import { SessionService } from '../../sessions/session.service.js';
import { passwordResetEmail } from './password-reset-email.js';

const TOKEN_TTL_MINUTES = 30;
const RESEND_AFTER_MS = 60 * 1000;

// Solo para dueños: a los empleados les resetea la contraseña el dueño.
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  // Termina igual exista o no la cuenta: no sirve para averiguar emails.
  async request(email: string): Promise<void> {
    const user = await this.prisma.staffUser.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user || !(await this.isActiveOwner(user.id))) return;
    const token = await this.issueToken(user.id);
    if (!token) return;

    // Sin esperar el envío: si tardara solo cuando la cuenta existe, el tiempo
    // de respuesta lo delataría.
    const message = passwordResetEmail(
      user.email,
      this.appUrl,
      token,
      TOKEN_TTL_MINUTES,
    );
    this.sender.send(message).catch((error: unknown) => {
      this.logger.error('No se pudo mandar el mail de recuperación', error);
    });
  }

  async confirm(token: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    const staffUserId = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!record || record.consumedAt || record.expiresAt <= now) {
        throw new AppException('RESET_TOKEN_INVALID');
      }
      // Atómico: dos confirmaciones a la vez no usan el mismo token.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (count === 0) throw new AppException('RESET_TOKEN_INVALID');
      await tx.staffUser.update({
        where: { id: record.staffUserId },
        data: { passwordHash, mustChangePassword: false },
      });
      return record.staffUserId;
    });
    await this.sessions.endAll('staff', staffUserId);
  }

  private async isActiveOwner(staffUserId: string): Promise<boolean> {
    const owned = await runWithSetting(
      this.prisma,
      'app.staff_user_id',
      staffUserId,
      (tx) =>
        tx.staffMembership.count({
          where: { staffUserId, role: 'OWNER', active: true },
        }),
    );
    return owned > 0;
  }

  // Un pedido nuevo invalida los anteriores. Null si el último es muy reciente.
  private issueToken(staffUserId: string): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const last = await tx.passwordResetToken.findFirst({
        where: { staffUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (last && now.getTime() - last.createdAt.getTime() < RESEND_AFTER_MS) {
        return null;
      }
      await tx.passwordResetToken.updateMany({
        where: { staffUserId, consumedAt: null },
        data: { consumedAt: now },
      });
      const token = generateToken();
      await tx.passwordResetToken.create({
        data: {
          staffUserId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000),
        },
      });
      return token;
    });
  }
}
