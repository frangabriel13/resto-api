import type { Request, Response } from 'express';
import {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from './session-cookie.js';

const fakeResponse = () => {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  return res as unknown as Response & typeof res;
};

describe('session cookie', () => {
  it('en producción la cookie es Secure', () => {
    const res = fakeResponse();
    writeSessionCookie(
      res,
      'staff',
      'token',
      new Date(Date.now() + 60_000),
      true,
    );
    clearSessionCookie(res, 'staff', true);

    expect(res.cookie).toHaveBeenCalledWith(
      'fs_staff',
      'token',
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'fs_staff',
      expect.objectContaining({ secure: true }),
    );
  });

  it('lee solo la cookie del tipo de sesión pedido', () => {
    const req = {
      headers: { cookie: 'fs_customer=abc; otra=1; fs_staff=xyz' },
    } as Request;
    expect(readSessionCookie(req, 'staff')).toBe('xyz');
    expect(readSessionCookie(req, 'customer')).toBe('abc');
    expect(readSessionCookie(req, 'admin')).toBeUndefined();
  });
});
