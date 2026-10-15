import { Injectable } from '@nestjs/common';
import { CustomerContext } from '../../common/customer-scope/customer-context.js';
import type { Customer } from '../../generated/prisma/client.js';
import type { MeResponse } from './me.schemas.js';

@Injectable()
export class MeService {
  constructor(private readonly customer: CustomerContext) {}

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
}

// CustomerRoute garantiza una cuenta no borrada, que tiene nombre y teléfono.
function toResponse(customer: Customer): MeResponse {
  return {
    id: customer.id,
    name: customer.name ?? '',
    phoneE164: customer.phoneE164 ?? '',
  };
}
