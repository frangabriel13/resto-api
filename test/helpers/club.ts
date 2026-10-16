import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hashPassword } from './../../src/common/passwords.js';
import type { StaffRole } from './../../src/generated/prisma/client.js';
import type { PrismaService } from './../../src/prisma/prisma.service.js';
import type { FakeOtpSender } from './fake-otp-sender.js';
import { loginCustomer } from './sessions.js';

export const STAFF_PASSWORD = 'clave-correcta';

export type ClubMember = {
  cookie: string;
  membershipId: string;
  customerId: string;
};

// Comercio activo con regla de 8 sellos, cooldown de 60 minutos y su staff.
export async function createClub(
  prisma: PrismaService,
  slug: string,
  staff: [email: string, role: StaffRole][],
) {
  const merchant = await prisma.merchant.create({
    data: { name: slug, slug, status: 'ACTIVE', stampCooldownMinutes: 60 },
  });
  const rule = await prisma.rewardRule.create({
    data: {
      merchantId: merchant.id,
      version: 1,
      stampsRequired: 8,
      rewardDescription: 'Premio',
      active: true,
    },
  });
  const passwordHash = await hashPassword(STAFF_PASSWORD);
  const staffIds: Record<string, string> = {};
  for (const [email, role] of staff) {
    const user = await prisma.staffUser.create({
      data: {
        email,
        name: email.split('@')[0]!,
        passwordHash,
        mustChangePassword: false,
        memberships: { create: { merchantId: merchant.id, role } },
      },
    });
    staffIds[email] = user.id;
  }
  return { merchantId: merchant.id, ruleId: rule.id, staffIds };
}

export async function joinClub(
  app: INestApplication<App>,
  sender: FakeOtpSender,
  phone: string,
  name: string,
  merchantId: string,
): Promise<ClubMember> {
  const { body, cookie } = await loginCustomer(app, sender, phone, name);
  const res = await request(app.getHttpServer())
    .post('/me/memberships')
    .set('Cookie', cookie)
    .send({ merchantId })
    .expect(200);
  return {
    cookie,
    membershipId: res.body.membership.id,
    customerId: body.customer.id,
  };
}

export async function stampTokenFor(
  app: INestApplication<App>,
  member: ClubMember,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .get(`/me/memberships/${member.membershipId}/stamp-token`)
    .set('Cookie', member.cookie)
    .expect(200);
  return res.body.token;
}
