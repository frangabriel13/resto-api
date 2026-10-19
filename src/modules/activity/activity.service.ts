import { Injectable } from '@nestjs/common';
import { resolveArRange, type ArRange } from '../../common/ar-time.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  joinedEvent,
  joinInclude,
  redemptionEvent,
  redemptionInclude,
  redemptionVoidedEvent,
  stampEvent,
  stampInclude,
  stampVoidedEvent,
  type DatedEvent,
} from './activity-events.js';
import {
  decodeCursor,
  encodeCursor,
  takePage,
  type ActivityKey,
  type ActivityType,
} from './activity-page.js';
import type { ActivityPage, ActivityQuery } from './activity.schemas.js';

const PAGE_SIZE = 50;

type Window = { range: ArRange; cursor: ActivityKey | null };
type TimeField = 'createdAt' | 'voidedAt' | 'joinedAt';

@Injectable()
export class ActivityService {
  constructor(private readonly tenant: TenantContext) {}

  async list(query: ActivityQuery): Promise<ActivityPage> {
    const window = {
      range: this.rangeOf(query),
      cursor: query.cursor ? this.cursorOf(query.cursor) : null,
    };
    const page = takePage(await this.events(window), PAGE_SIZE);
    return {
      items: page.items.map((event) => ({
        ...event,
        at: event.at.toISOString(),
      })),
      nextCursor: page.next && encodeCursor(page.next),
    };
  }

  // De a una: comparten la conexión de la transacción del request.
  private async events(window: Window): Promise<DatedEvent[]> {
    const { db } = this.tenant;
    const { role } = this.tenant.scope;
    const take = PAGE_SIZE + 1;
    const query = (type: ActivityType, field: TimeField) => ({
      where: { AND: windowFilter(type, field, window) },
      orderBy: [{ [field]: 'desc' as const }, { id: 'desc' as const }],
      take,
    });

    const stamps = await db.stamp.findMany({
      ...(query('STAMP', 'createdAt') as Prisma.StampFindManyArgs),
      include: stampInclude,
    });
    const voidedStamps = await db.stamp.findMany({
      ...(query('STAMP_VOIDED', 'voidedAt') as Prisma.StampFindManyArgs),
      include: stampInclude,
    });
    const redemptions = await db.redemption.findMany({
      ...(query('REDEMPTION', 'createdAt') as Prisma.RedemptionFindManyArgs),
      include: redemptionInclude,
    });
    const voidedRedemptions = await db.redemption.findMany({
      ...(query(
        'REDEMPTION_VOIDED',
        'voidedAt',
      ) as Prisma.RedemptionFindManyArgs),
      include: redemptionInclude,
    });
    const joins = await db.membership.findMany({
      ...(query('JOINED', 'joinedAt') as Prisma.MembershipFindManyArgs),
      include: joinInclude,
    });

    return [
      ...stamps.map((s) => stampEvent(s, role)),
      ...voidedStamps.map((s) => stampVoidedEvent(s, role)),
      ...redemptions.map((r) => redemptionEvent(r, role)),
      ...voidedRedemptions.map((r) => redemptionVoidedEvent(r, role)),
      ...joins.map((m) => joinedEvent(m, role)),
    ];
  }

  private rangeOf(query: ActivityQuery): ArRange {
    const range = resolveArRange(query, 1, new Date());
    if (!range) throw new AppException('INVALID_DATE_RANGE');
    return range;
  }

  private cursorOf(raw: string): ActivityKey {
    const cursor = decodeCursor(raw);
    if (!cursor) {
      throw new AppException('VALIDATION_ERROR', 'El cursor no es válido.');
    }
    return cursor;
  }
}

// Filas de una fuente dentro del rango y después del cursor, en el mismo orden
// que compareEvents: a igual instante, los ids menores van después.
function windowFilter(
  type: ActivityType,
  field: TimeField,
  { range, cursor }: Window,
): Record<string, unknown>[] {
  const inRange = { [field]: { gte: range.start, lt: range.end } };
  if (!cursor) return [inRange];

  const [cursorType, cursorUuid] = cursor.id.split(':');
  const sameInstant =
    type === cursorType
      ? [{ [field]: cursor.at, id: { lt: cursorUuid } }]
      : `${type}:` < `${cursorType}:`
        ? [{ [field]: cursor.at }]
        : [];
  return [inRange, { OR: [{ [field]: { lt: cursor.at } }, ...sameInstant] }];
}
