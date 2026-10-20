import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { createClub, STAFF_PASSWORD } from './helpers/club.js';
import { loginStaff } from './helpers/sessions.js';

describe('Panel: empleados (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let heladeria: Awaited<ReturnType<typeof createClub>>;
  let owner: string;
  let employee: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    cafe = await createClub(prisma, 'cafe', [
      ['duena@cafe.com', 'OWNER'],
      ['empleado@cafe.com', 'EMPLOYEE'],
    ]);
    heladeria = await createClub(prisma, 'heladeria', [
      ['empleada@heladeria.com', 'EMPLOYEE'],
    ]);
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
  });

  afterEach(async () => {
    await app.close();
  });

  const employeeId = () => cafe.staffIds['empleado@cafe.com']!;
  const http = () => request(app.getHttpServer());
  const list = (cookie = owner) =>
    http().get('/panel/staff').set('Cookie', cookie);
  const create = (body: object) =>
    http().post('/panel/staff').set('Cookie', owner).send(body);
  const setActive = (id: string, active: boolean) =>
    http().patch(`/panel/staff/${id}`).set('Cookie', owner).send({ active });
  const resetPassword = (id: string) =>
    http().post(`/panel/staff/${id}/reset-password`).set('Cookie', owner);
  const login = (email: string, password: string) =>
    http().post('/auth/staff/login').send({ email, password });
  const panelAs = (cookie: string) =>
    http().get('/panel/activity').set('Cookie', cookie);
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { status },
    });
  const auditActions = async () =>
    (
      await prisma.auditEvent.findMany({
        where: { merchantId: cafe.merchantId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((e) => e.action);

  it('lista a los dueños y empleados del comercio, solo para el OWNER', async () => {
    const res = await list().expect(200);
    expect(res.body).toMatchObject([
      { email: 'duena@cafe.com', role: 'OWNER', active: true },
      {
        email: 'empleado@cafe.com',
        role: 'EMPLOYEE',
        active: true,
        pendingFirstLogin: false,
      },
    ]);
    await list(employee).expect(403);
  });

  it('el empleado nuevo entra con la contraseña temporal y tiene que cambiarla', async () => {
    const res = await create({ email: 'Nuevo@Cafe.com', name: 'Nuevo' }).expect(
      201,
    );
    expect(res.body.staff).toMatchObject({
      email: 'nuevo@cafe.com',
      role: 'EMPLOYEE',
      active: true,
      pendingFirstLogin: true,
    });
    expect(res.body.temporaryPassword).toHaveLength(16);

    const { cookie } = await loginStaff(
      app,
      'nuevo@cafe.com',
      res.body.temporaryPassword,
    );
    const blocked = await panelAs(cookie).expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'staff.created' },
    });
    expect(audit.payload).toEqual({
      role: 'EMPLOYEE',
      email: 'nuevo@cafe.com',
      newUser: true,
    });
  });

  it('con el email de alguien de otro comercio, conserva su contraseña', async () => {
    const res = await create({
      email: 'empleada@heladeria.com',
      name: 'Otro nombre',
    }).expect(201);
    expect(res.body).toMatchObject({
      temporaryPassword: null,
      staff: { name: 'empleada', pendingFirstLogin: false },
    });

    const login = await loginStaff(
      app,
      'empleada@heladeria.com',
      STAFF_PASSWORD,
    );
    expect(login.body.merchants).toHaveLength(2);

    const repeated = await create({
      email: 'empleada@heladeria.com',
      name: 'Otra vez',
    }).expect(409);
    expect(repeated.body.code).toBe('STAFF_ALREADY_IN_MERCHANT');
  });

  it('dado de baja pierde el acceso, y reactivado lo recupera', async () => {
    const res = await setActive(employeeId(), false).expect(200);
    expect(res.body.active).toBe(false);
    const revoked = await panelAs(employee).expect(403);
    expect(revoked.body.code).toBe('MERCHANT_ACCESS_REVOKED');

    await setActive(employeeId(), false).expect(200);
    await setActive(employeeId(), true).expect(200);
    await panelAs(employee).expect(200);
    // La baja repetida no se audita dos veces.
    expect(await auditActions()).toEqual([
      'staff.deactivated',
      'staff.reactivated',
    ]);
  });

  it('el reset cierra sus sesiones y solo vale la contraseña temporal', async () => {
    const res = await resetPassword(employeeId()).expect(200);
    const { temporaryPassword } = res.body;

    await http().get('/auth/staff/me').set('Cookie', employee).expect(401);
    const old = await login('empleado@cafe.com', STAFF_PASSWORD).expect(401);
    expect(old.body.code).toBe('INVALID_CREDENTIALS');
    const fresh = await login('empleado@cafe.com', temporaryPassword).expect(
      200,
    );
    expect(fresh.body.user.mustChangePassword).toBe(true);
    expect(await auditActions()).toEqual(['staff.password_reset']);
  });

  it('no da de baja ni resetea a un dueño', async () => {
    const ownerId = cafe.staffIds['duena@cafe.com']!;
    for (const res of [
      await setActive(ownerId, false),
      await resetPassword(ownerId),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('STAFF_IS_OWNER');
    }
  });

  it('no resetea la contraseña de alguien que también trabaja en otro comercio', async () => {
    const sharedId = heladeria.staffIds['empleada@heladeria.com']!;
    await create({ email: 'empleada@heladeria.com', name: 'x' }).expect(201);
    const before = await prisma.staffUser.findUniqueOrThrow({
      where: { id: sharedId },
    });

    const res = await resetPassword(sharedId).expect(409);

    expect(res.body.code).toBe('STAFF_ACCOUNT_SHARED');
    const after = await prisma.staffUser.findUniqueOrThrow({
      where: { id: sharedId },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('con el club pausado: baja y reset sí, alta y reactivación no', async () => {
    await setStatus('PAUSED');

    const created = await create({ email: 'otro@cafe.com', name: 'Otro' });
    expect(created.body.code).toBe('MERCHANT_READ_ONLY');
    await setActive(employeeId(), false).expect(200);
    const reactivated = await setActive(employeeId(), true).expect(409);
    expect(reactivated.body.code).toBe('MERCHANT_READ_ONLY');
    await resetPassword(employeeId()).expect(200);
  });

  it('valida los datos', async () => {
    await create({ email: 'no-es-un-email', name: 'X' }).expect(400);
    await http()
      .patch(`/panel/staff/${employeeId()}`)
      .set('Cookie', owner)
      .send({ active: false, role: 'OWNER' })
      .expect(400);
    await setActive('01a15453-60c3-736d-bacc-88e360eb84d4', false).expect(404);
  });
});
