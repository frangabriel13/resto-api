import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { deriveKey } from '../../../common/crypto.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import {
  runWithSetting,
  setTransactionSetting,
} from '../../../common/request-scope/scoped-transaction.js';
import type { Env } from '../../../config/env.js';
import type {
  Customer,
  OtpChallenge,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SessionService } from '../sessions/session.service.js';
import type {
  CustomerLogin,
  OtpRequested,
  VerifyOtpBody,
} from './customer-auth.schemas.js';
import { generateOtpCode, hashOtpCode, otpCodeMatches } from './otp-code.js';
import { OTP_SENDER, type OtpSender } from './otp-sender.js';

const SECOND = 1000;
const OTP_TTL_MS = 10 * 60 * SECOND;
const RESEND_AFTER_MS = 60 * SECOND;
const REQUEST_WINDOW_MS = 60 * 60 * SECOND;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_ATTEMPTS = 5;

@Injectable()
export class CustomerOtpService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    config: ConfigService<Env, true>,
  ) {
    this.key = deriveKey(config.get('SECRET_KEY', { infer: true }), 'otp');
  }

  // Responde lo mismo tenga o no cuenta el teléfono.
  request(phone: string): Promise<OtpRequested> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}::text))`;
      await assertCanRequest(tx, phone);

      const code = generateOtpCode();
      await tx.otpChallenge.create({
        data: {
          phoneE164: phone,
          codeHash: hashOtpCode(this.key, phone, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });
      await this.sender.send(phone, code);
      return {
        expiresInSeconds: OTP_TTL_MS / SECOND,
        resendInSeconds: RESEND_AFTER_MS / SECOND,
      };
    });
  }

  async verify(
    { phone, code, name }: VerifyOtpBody,
    req: Request,
    res: Response,
  ): Promise<CustomerLogin> {
    const challenge = await this.useAttempt(phone);
    if (!otpCodeMatches(this.key, phone, code, challenge.codeHash)) {
      throw new AppException('OTP_INVALID', undefined, {
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - challenge.attempts - 1),
      });
    }

    const existing = await runWithSetting(
      this.prisma,
      'app.customer_phone',
      phone,
      (tx) => tx.customer.findUnique({ where: { phoneE164: phone } }),
    );
    const target = existing ?? (name ? { phone, name } : null);
    // Sin consumir el código: el front pide el nombre y lo reenvía.
    if (!target) throw new AppException('NAME_REQUIRED');

    const customer = await this.consumeAndGetCustomer(challenge.id, target);
    await this.sessions.start('customer', customer.id, req, res);
    return {
      customer: { id: customer.id, name: customer.name ?? '' },
      isNew: !existing,
    };
  }

  // Solo vale el último código pedido. El intento se cuenta de forma atómica.
  private async useAttempt(phone: string): Promise<OtpChallenge> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phoneE164: phone },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date()
    ) {
      throw new AppException('OTP_EXPIRED');
    }
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (count === 0) throw new AppException('OTP_TOO_MANY_ATTEMPTS');
    return challenge;
  }

  private async consumeAndGetCustomer(
    challengeId: string,
    customer: Customer | { phone: string; name: string },
  ): Promise<Customer> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.otpChallenge.updateMany({
          where: { id: challengeId, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (count === 0) throw new AppException('OTP_EXPIRED');
        if ('id' in customer) return customer;
        await setTransactionSetting(tx, 'app.customer_phone', customer.phone);
        return tx.customer.create({
          data: {
            name: customer.name,
            phoneE164: customer.phone,
            phoneVerifiedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('OTP_EXPIRED');
      throw error;
    }
  }
}

async function assertCanRequest(tx: Prisma.TransactionClient, phone: string) {
  const now = Date.now();
  const recent = await tx.otpChallenge.findMany({
    where: {
      phoneE164: phone,
      createdAt: { gte: new Date(now - REQUEST_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, consumedAt: true },
  });
  const last = recent[0];
  // Si el último código ya se usó (entró y salió), no hace falta esperar.
  const sinceLast =
    last && !last.consumedAt ? now - last.createdAt.getTime() : Infinity;
  if (sinceLast < RESEND_AFTER_MS) {
    throw new AppException('OTP_RESEND_TOO_SOON', undefined, {
      retryAfterSeconds: Math.ceil((RESEND_AFTER_MS - sinceLast) / SECOND),
    });
  }
  const oldest = recent.at(-1);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW && oldest) {
    throw new AppException('OTP_LIMIT_REACHED', undefined, {
      retryAfterSeconds: Math.ceil(
        (oldest.createdAt.getTime() + REQUEST_WINDOW_MS - now) / SECOND,
      ),
    });
  }
}
