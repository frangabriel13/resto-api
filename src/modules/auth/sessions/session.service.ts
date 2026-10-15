import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from './session-cookie.js';
import {
  SESSION_KINDS,
  SESSION_RENEW_AFTER_MS,
  type AuthSession,
  type SessionKind,
} from './session-kinds.js';
import {
  createSessionStores,
  type SessionRecord,
  type SessionStore,
} from './session-stores.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

const MAX_USER_AGENT_LENGTH = 512;

@Injectable()
export class SessionService {
  private readonly stores: Record<SessionKind, SessionStore>;
  private readonly secureCookies: boolean;

  constructor(prisma: PrismaService, config: ConfigService<Env, true>) {
    this.stores = createSessionStores(prisma);
    this.secureCookies =
      config.get('NODE_ENV', { infer: true }) === 'production';
  }

  async start(
    kind: SessionKind,
    ownerId: string,
    req: Request,
    res: Response,
  ): Promise<AuthSession> {
    const token = generateSessionToken();
    const expiresAt = this.expiresFromNow(kind);
    const session = await this.stores[kind].create({
      ownerId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: req.headers['user-agent']?.slice(0, MAX_USER_AGENT_LENGTH),
    });
    writeSessionCookie(res, kind, token, expiresAt, this.secureCookies);
    return { kind, sessionId: session.id, ownerId };
  }

  async authenticate(
    kind: SessionKind,
    req: Request,
    res: Response,
  ): Promise<AuthSession | null> {
    const token = readSessionCookie(req, kind);
    if (!token) return null;

    const session = await this.stores[kind].findByTokenHash(
      hashSessionToken(token),
    );
    if (!session || !isActive(session)) {
      clearSessionCookie(res, kind, this.secureCookies);
      return null;
    }

    if (Date.now() - session.lastUsedAt.getTime() > SESSION_RENEW_AFTER_MS) {
      const expiresAt = this.expiresFromNow(kind);
      await this.stores[kind].renew(session.id, new Date(), expiresAt);
      writeSessionCookie(res, kind, token, expiresAt, this.secureCookies);
    }
    return { kind, sessionId: session.id, ownerId: session.ownerId };
  }

  async end(kind: SessionKind, req: Request, res: Response): Promise<void> {
    const token = readSessionCookie(req, kind);
    if (token) {
      await this.stores[kind].revokeByTokenHash(
        hashSessionToken(token),
        new Date(),
      );
    }
    clearSessionCookie(res, kind, this.secureCookies);
  }

  async endOthers(session: AuthSession): Promise<void> {
    await this.stores[session.kind].revokeOthers(
      session.ownerId,
      session.sessionId,
      new Date(),
    );
  }

  private expiresFromNow(kind: SessionKind): Date {
    return new Date(Date.now() + SESSION_KINDS[kind].ttlMs);
  }
}

function isActive(session: SessionRecord): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > Date.now();
}
