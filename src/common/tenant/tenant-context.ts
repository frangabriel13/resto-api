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
  stampCooldownMinutes: number;
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

type AfterCommitTask = () => Promise<void>;
type TenantStore = TenantScope & {
  db: TenantDb;
  afterCommit: AfterCommitTask[];
};

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

  async run<T>(scope: TenantScope, work: () => Promise<T>): Promise<T> {
    const afterCommit: AfterCommitTask[] = [];
    const result = await this.client.$transaction(
      async (tx) => {
        await setTransactionSetting(tx, 'app.merchant_id', scope.merchantId);
        return this.store.run({ ...scope, db: tx, afterCommit }, work);
      },
      { timeout: SCOPED_TRANSACTION_TIMEOUT_MS },
    );
    for (const task of afterCommit) await task();
    return result;
  }

  // Para lo que no se puede deshacer (borrar un archivo): corre solo si la
  // transacción del request se confirmó. La tarea no debe lanzar errores.
  afterCommit(task: AfterCommitTask) {
    this.store.current().afterCommit.push(task);
  }

  get scope(): TenantScope {
    const {
      db: _db,
      afterCommit: _afterCommit,
      ...scope
    } = this.store.current();
    return scope;
  }

  get db(): TenantDb {
    return this.store.current().db;
  }
}
