import { Injectable } from '@nestjs/common';
import type { ITXClientDenyList } from '@prisma/client/runtime/client';
import type {
  MerchantStatus,
  StaffRole,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestStore } from '../request-scope/request-store.js';
import {
  SCOPED_TRANSACTION_TIMEOUT_MS,
  setTransactionSetting,
} from '../request-scope/scoped-transaction.js';
import { tenantScope } from './tenant-scope.extension.js';

export type TenantScope = {
  merchantId: string;
  merchantStatus: MerchantStatus;
  staffUserId: string;
  role: StaffRole;
};

const createTenantClient = (
  prisma: PrismaService,
  currentMerchantId: () => string | undefined,
) => prisma.$extends(tenantScope(currentMerchantId));

export type TenantDb = Omit<
  ReturnType<typeof createTenantClient>,
  ITXClientDenyList
>;

type TenantStore = TenantScope & { db: TenantDb };

@Injectable()
export class TenantContext {
  private readonly store = new RequestStore<TenantStore>(
    'TenantContext se usó fuera de una ruta del panel',
  );
  private readonly client: ReturnType<typeof createTenantClient>;

  constructor(prisma: PrismaService) {
    this.client = createTenantClient(
      prisma,
      () => this.store.find()?.merchantId,
    );
  }

  run<T>(scope: TenantScope, work: () => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx) => {
        await setTransactionSetting(tx, 'app.merchant_id', scope.merchantId);
        return this.store.run({ ...scope, db: tx }, work);
      },
      { timeout: SCOPED_TRANSACTION_TIMEOUT_MS },
    );
  }

  get scope(): TenantScope {
    const { db: _db, ...scope } = this.store.current();
    return scope;
  }

  get db(): TenantDb {
    return this.store.current().db;
  }
}
