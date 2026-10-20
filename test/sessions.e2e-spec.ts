import {
  Body,
  Controller,
  Get,
  INestApplication,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseSetCookie, type SetCookie } from 'cookie';
import type { Request, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Auth } from './../src/modules/auth/sessions/auth.decorator.js';
import {
  SESSION_KINDS,
  type AuthSession,
  type SessionKind,
} from './../src/modules/auth/sessions/session-kinds.js';
import { SessionGuard } from './../src/modules/auth/sessions/session.guard.js';
import { SessionService } from './../src/modules/auth/sessions/session.service.js';
import { hashToken } from './../src/common/tokens.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';

@Controller('test-sessions')
class TestSessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Post(':kind/login')
  login(
    @Param('kind') kind: SessionKind,
    @Body() body: { ownerId: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sessions.start(kind, body.ownerId, req, res);
  }

  @Post(':kind/logout')
  logout(
    @Param('kind') kind: SessionKind,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sessions.end(kind, req, res);
  }

  @Get('staff/me')
  @UseGuards(SessionGuard('staff'))
  staff(@Auth() auth: AuthSession) {
    return auth;
  }

  @Get('customer/me')
  @UseGuards(SessionGuard('customer'))
  customer(@Auth() auth: AuthSession) {
    return auth;
  }

  @Get('admin/me')
  @UseGuards(SessionGuard('admin'))
  admin(@Auth() auth: AuthSession) {
    return auth;
  }
}

const TABLES: Record<SessionKind, string> = {
  staff: 'staff_sessions',
  customer: 'customer_sessions',
  admin: 'platform_admin_sessions',
};

type SessionRow = {
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
};

const HOUR = 60 * 60 * 1000;

describe('Sesiones (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let owners: Record<SessionKind, string>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestSessionsController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const staff = await prisma.staffUser.create({
      data: { email: 'staff@test', passwordHash: 'x', name: 'Staff' },
    });
    const customer = await prisma.customer.create({
      data: { name: 'Cliente', phoneE164: '+5491100000001' },
    });
    const admin = await prisma.platformAdmin.create({
      data: { email: 'admin@test', passwordHash: 'x', name: 'Admin' },
    });
    owners = { staff: staff.id, customer: customer.id, admin: admin.id };
  });

  const login = async (kind: SessionKind) => {
    const res = await request(app.getHttpServer())
      .post(`/test-sessions/${kind}/login`)
      .send({ ownerId: owners[kind] })
      .expect(201);
    const cookie = sessionCookie(res.headers, kind);
    if (!cookie?.value) throw new Error('El login no dejó la cookie');
    return { ...cookie, value: cookie.value };
  };

  const me = (kind: SessionKind, cookie?: string) => {
    const req = request(app.getHttpServer()).get(`/test-sessions/${kind}/me`);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const findSession = async (kind: SessionKind) => {
    const rows = await prisma.$queryRawUnsafe<SessionRow[]>(
      `SELECT token_hash AS "tokenHash", expires_at AS "expiresAt",
              last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
       FROM ${TABLES[kind]}`,
    );
    return rows[0]!;
  };

  const updateSession = (kind: SessionKind, set: string, ...values: Date[]) =>
    prisma.$executeRawUnsafe(`UPDATE ${TABLES[kind]} SET ${set}`, ...values);

  describe.each(['staff', 'customer', 'admin'] as const)('%s', (kind) => {
    const { cookieName, ttlMs } = SESSION_KINDS[kind];

    it('iniciar sesión deja una cookie httpOnly y guarda solo el hash del token', async () => {
      const cookie = await login(kind);

      expect(cookie).toMatchObject({
        name: cookieName,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      expect(cookie.secure).toBeFalsy();
      expect(cookie.maxAge).toBeCloseTo(ttlMs / 1000, -1);

      const session = await findSession(kind);
      expect(session.tokenHash).toBe(hashToken(cookie.value));
      expect(session.tokenHash).not.toContain(cookie.value);
    });

    it('con la cookie entra; sin cookie o con un token inventado, no', async () => {
      const cookie = await login(kind);

      const res = await me(kind, asHeader(cookie)).expect(200);
      expect(res.body).toMatchObject({ kind, ownerId: owners[kind] });

      const anonymous = await me(kind).expect(401);
      expect(anonymous.body.code).toBe('UNAUTHENTICATED');
      const invented = await me(kind, `${cookieName}=inventado`).expect(401);
      expect(sessionCookie(invented.headers, kind)?.value).toBe('');
    });

    it('una sesión vencida o revocada no sirve', async () => {
      const cookie = asHeader(await login(kind));

      await updateSession(kind, 'expires_at = $1', new Date(Date.now() - 1));
      await me(kind, cookie).expect(401);

      await updateSession(
        kind,
        'expires_at = $1, revoked_at = $2',
        new Date(Date.now() + HOUR),
        new Date(),
      );
      await me(kind, cookie).expect(401);
    });

    it('se renueva si pasó más de una hora desde el último uso', async () => {
      const cookie = asHeader(await login(kind));
      await updateSession(
        kind,
        'last_used_at = $1, expires_at = $2',
        new Date(Date.now() - 2 * HOUR),
        new Date(Date.now() + HOUR),
      );

      const res = await me(kind, cookie).expect(200);

      expect(sessionCookie(res.headers, kind)?.maxAge).toBeCloseTo(
        ttlMs / 1000,
        -1,
      );
      const session = await findSession(kind);
      expect(session.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + ttlMs - 60_000,
      );
      expect(session.lastUsedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('no escribe en cada request', async () => {
      const cookie = asHeader(await login(kind));
      const before = await findSession(kind);

      const res = await me(kind, cookie).expect(200);

      expect(sessionCookie(res.headers, kind)).toBeUndefined();
      expect(await findSession(kind)).toEqual(before);
    });

    it('cerrar sesión la revoca y borra la cookie', async () => {
      const cookie = asHeader(await login(kind));

      const res = await request(app.getHttpServer())
        .post(`/test-sessions/${kind}/logout`)
        .set('Cookie', cookie)
        .expect(201);

      expect(sessionCookie(res.headers, kind)?.value).toBe('');
      expect((await findSession(kind)).revokedAt).not.toBeNull();
      await me(kind, cookie).expect(401);
    });
  });

  it('una sesión de un tipo no sirve para otro', async () => {
    const staff = await login('staff');

    await me('customer', asHeader(staff)).expect(401);
    const customerCookieName = SESSION_KINDS.customer.cookieName;
    await me('customer', `${customerCookieName}=${staff.value}`).expect(401);
  });
});

function sessionCookie(
  headers: Record<string, unknown>,
  kind: SessionKind,
): SetCookie | undefined {
  const setCookie = (headers['set-cookie'] as string[] | undefined) ?? [];
  return setCookie
    .map((header) => parseSetCookie(header))
    .find((cookie) => cookie.name === SESSION_KINDS[kind].cookieName);
}

function asHeader(cookie: SetCookie): string {
  return `${cookie.name}=${cookie.value}`;
}
