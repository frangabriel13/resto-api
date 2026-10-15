import { parseCookie } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import { SESSION_KINDS, type SessionKind } from './session-kinds.js';

const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure,
  path: '/',
});

export function readSessionCookie(
  req: Request,
  kind: SessionKind,
): string | undefined {
  return parseCookie(req.headers.cookie ?? '')[SESSION_KINDS[kind].cookieName];
}

export function writeSessionCookie(
  res: Response,
  kind: SessionKind,
  token: string,
  expiresAt: Date,
  secure: boolean,
) {
  res.cookie(SESSION_KINDS[kind].cookieName, token, {
    ...baseOptions(secure),
    maxAge: expiresAt.getTime() - Date.now(),
  });
}

export function clearSessionCookie(
  res: Response,
  kind: SessionKind,
  secure: boolean,
) {
  res.clearCookie(SESSION_KINDS[kind].cookieName, baseOptions(secure));
}
