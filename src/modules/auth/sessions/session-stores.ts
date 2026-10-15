import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { SessionKind } from './session-kinds.js';

export type SessionRecord = {
  id: string;
  ownerId: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
};

export type NewSession = {
  ownerId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
};

export interface SessionStore {
  create(session: NewSession): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  renew(id: string, lastUsedAt: Date, expiresAt: Date): Promise<void>;
  revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<void>;
  revokeOthers(ownerId: string, keepId: string, revokedAt: Date): Promise<void>;
}

type SessionRow = Omit<SessionRecord, 'ownerId'>;

// Las tres tablas de sesiones tienen la misma forma salvo la columna del dueño.
type SessionDelegate<Row extends SessionRow> = {
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  findUnique(args: { where: { tokenHash: string } }): Promise<Row | null>;
  update(args: {
    where: { id: string };
    data: { lastUsedAt: Date; expiresAt: Date };
  }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: { revokedAt: Date };
  }): Promise<unknown>;
};

function storeFor<Row extends SessionRow>(
  delegate: SessionDelegate<Row>,
  ownerColumn: keyof Row & string,
): SessionStore {
  const toRecord = (row: Row): SessionRecord => ({
    id: row.id,
    ownerId: row[ownerColumn] as string,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  });

  return {
    async create({ ownerId, ...session }) {
      const row = await delegate.create({
        data: { ...session, [ownerColumn]: ownerId },
      });
      return toRecord(row);
    },
    async findByTokenHash(tokenHash) {
      const row = await delegate.findUnique({ where: { tokenHash } });
      return row && toRecord(row);
    },
    async renew(id, lastUsedAt, expiresAt) {
      await delegate.update({ where: { id }, data: { lastUsedAt, expiresAt } });
    },
    async revokeByTokenHash(tokenHash, revokedAt) {
      await delegate.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt },
      });
    },
    async revokeOthers(ownerId, keepId, revokedAt) {
      await delegate.updateMany({
        where: { [ownerColumn]: ownerId, id: { not: keepId }, revokedAt: null },
        data: { revokedAt },
      });
    },
  };
}

export function createSessionStores(
  prisma: PrismaService,
): Record<SessionKind, SessionStore> {
  return {
    staff: storeFor(prisma.staffSession, 'staffUserId'),
    customer: storeFor(prisma.customerSession, 'customerId'),
    admin: storeFor(prisma.platformAdminSession, 'platformAdminId'),
  };
}
