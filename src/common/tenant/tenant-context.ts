import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { ITXClientDenyList } from '@prisma/client/runtime/client';
import type {
  MerchantStatus,
  StaffRole,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
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

const TRANSACTION_TIMEOUT_MS = 15_000;

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantStore>();
  private readonly client: ReturnType<typeof createTenantClient>;

  constructor(prisma: PrismaService) {
    this.client = createTenantClient(
      prisma,
      () => this.storage.getStore()?.merchantId,
    );
  }

  run<T>(scope: TenantScope, work: () => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.merchant_id', ${scope.merchantId}, true)`;
        return this.storage.run({ ...scope, db: tx }, work);
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  get scope(): TenantScope {
    const { db: _db, ...scope } = this.current();
    return scope;
  }

  get db(): TenantDb {
    return this.current().db;
  }

  private current(): TenantStore {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error('TenantContext se usó fuera de una ruta del panel');
    }
    return store;
  }
}
