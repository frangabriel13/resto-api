import { Injectable } from '@nestjs/common';
import type { ITXClientDenyList } from '@prisma/client/runtime/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestStore } from '../request-scope/request-store.js';
import {
  SCOPED_TRANSACTION_TIMEOUT_MS,
  setTransactionSetting,
} from '../request-scope/scoped-transaction.js';
import { customerScope } from './customer-scope.extension.js';

const createCustomerClient = (
  prisma: PrismaService,
  currentCustomerId: () => string | undefined,
) => prisma.$extends(customerScope(currentCustomerId));

export type CustomerDb = Omit<
  ReturnType<typeof createCustomerClient>,
  ITXClientDenyList
>;

type CustomerStore = { customerId: string; db: CustomerDb };

@Injectable()
export class CustomerContext {
  private readonly store = new RequestStore<CustomerStore>(
    'CustomerContext se usó fuera de una ruta del cliente',
  );
  private readonly client: ReturnType<typeof createCustomerClient>;

  constructor(prisma: PrismaService) {
    this.client = createCustomerClient(
      prisma,
      () => this.store.find()?.customerId,
    );
  }

  run<T>(customerId: string, work: () => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx) => {
        await setTransactionSetting(tx, 'app.customer_id', customerId);
        return this.store.run({ customerId, db: tx }, work);
      },
      { timeout: SCOPED_TRANSACTION_TIMEOUT_MS },
    );
  }

  get customerId(): string {
    return this.store.current().customerId;
  }

  get db(): CustomerDb {
    return this.store.current().db;
  }
}
