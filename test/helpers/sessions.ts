import type { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types.js';
import type { FakeOtpSender } from './fake-otp-sender.js';

export function sessionCookie(res: Response, name = 'fs_staff'): string {
  const header = (res.headers['set-cookie'] as unknown as string[])?.find(
    (cookie) => cookie.startsWith(`${name}=`),
  );
  if (!header) throw new Error(`La respuesta no dejó la cookie ${name}`);
  return header.split(';')[0]!;
}

export async function loginStaff(
  app: INestApplication<App>,
  email: string,
  password: string,
) {
  const res = await request(app.getHttpServer())
    .post('/auth/staff/login')
    .send({ email, password })
    .expect(200);
  return { body: res.body, cookie: sessionCookie(res) };
}

export async function loginAdmin(
  app: INestApplication<App>,
  email: string,
  password: string,
) {
  const res = await request(app.getHttpServer())
    .post('/auth/admin/login')
    .send({ email, password })
    .expect(200);
  return sessionCookie(res, 'fs_admin');
}

export async function loginCustomer(
  app: INestApplication<App>,
  sender: FakeOtpSender,
  phone: string,
  name: string,
) {
  await request(app.getHttpServer())
    .post('/auth/customer/otp/request')
    .send({ phone })
    .expect(200);
  const res = await request(app.getHttpServer())
    .post('/auth/customer/otp/verify')
    .send({ phone, code: sender.lastCode, name })
    .expect(200);
  return { body: res.body, cookie: sessionCookie(res, 'fs_customer') };
}
