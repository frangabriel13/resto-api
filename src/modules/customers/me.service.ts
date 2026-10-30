import { Injectable } from '@nestjs/common';
import { CustomerContext } from '../../common/customer-scope/customer-context.js';
import type { Customer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionService } from '../auth/sessions/session.service.js';
import { leaveClubData } from '../memberships/leave-club.js';
import { anonymizedCustomerData } from './anonymized-customer.js';
import type { MeResponse } from './me.schemas.js';

@Injectable()
export class MeService {
  constructor(
    private readonly customer: CustomerContext,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async get(): Promise<MeResponse> {
    const customer = await this.customer.db.customer.findUniqueOrThrow({
      where: { id: this.customer.customerId },
    });
    return toResponse(customer);
  }

  async updateName(name: string): Promise<MeResponse> {
    const customer = await this.customer.db.customer.update({
      where: { id: this.customer.customerId },
      data: { name },
    });
    return toResponse(customer);
  }

  // Anonimiza: los sellos y canjes quedan para el comercio, sin datos
  // personales. El mismo teléfono puede registrarse otra vez, como cuenta nueva.
  async deleteAccount(): Promise<void> {
    const { db, customerId } = this.customer;
    const now = new Date();
    const { phoneE164 } = await db.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    const memberships = await db.membership.findMany({
      where: { leftAt: null },
    });
    for (const membership of memberships) {
      await db.membership.update({
        where: { id: membership.id },
        data: leaveClubData(membership, now),
      });
    }
    await db.customer.update({
      where: { id: customerId },
      data: anonymizedCustomerData(now),
    });
    // Sin RLS: los códigos guardan el teléfono y las sesiones no son del contexto.
    if (phoneE164) {
      await this.prisma.otpChallenge.deleteMany({ where: { phoneE164 } });
    }
    await this.sessions.endAll('customer', customerId);
  }
}

// CustomerRoute garantiza una cuenta no borrada, que tiene nombre y teléfono.
function toResponse(customer: Customer): MeResponse {
  return {
    id: customer.id,
    name: customer.name ?? '',
    phoneE164: customer.phoneE164 ?? '',
  };
}
