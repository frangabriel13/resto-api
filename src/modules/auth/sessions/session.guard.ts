import {
  CanActivate,
  ExecutionContext,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AuthSession, SessionKind } from './session-kinds.js';
import { SessionService } from './session.service.js';

export type AuthenticatedRequest = Request & { auth: AuthSession };

export async function authenticateRequest(
  sessions: SessionService,
  kind: SessionKind,
  context: ExecutionContext,
): Promise<AuthSession> {
  const http = context.switchToHttp();
  const req = http.getRequest<AuthenticatedRequest>();
  const auth = await sessions.authenticate(
    kind,
    req,
    http.getResponse<Response>(),
  );
  if (!auth) throw new AppException('UNAUTHENTICATED');
  req.auth = auth;
  return auth;
}

export function SessionGuard(kind: SessionKind): Type<CanActivate> {
  @Injectable()
  class KindSessionGuard implements CanActivate {
    constructor(private readonly sessions: SessionService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      await authenticateRequest(this.sessions, kind, context);
      return true;
    }
  }
  return mixin(KindSessionGuard);
}
