import { Injectable } from '@nestjs/common';
import {
  arDaysOf,
  resolveArRange,
  type ArRange,
} from '../../common/ar-time.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { countByArDay } from './daily-series.js';
import type { Stats } from './stats.schemas.js';

const DEFAULT_DAYS = 30;
const RETURNING_MIN_STAMPS = 2;

type StatsQuery = { from?: string; to?: string };

@Injectable()
export class StatsService {
  constructor(private readonly tenant: TenantContext) {}

  async get(query: StatsQuery): Promise<Stats> {
    const range = resolveArRange(query, DEFAULT_DAYS, new Date());
    if (!range) throw new AppException('INVALID_DATE_RANGE');
    return {
      range: { from: range.from, to: range.to },
      members: await this.members(),
      period: await this.period(range),
      daily: await this.daily(range),
    };
  }

  private async members(): Promise<Stats['members']> {
    const { db } = this.tenant;
    const active = { leftAt: null };
    const returning = await db.stamp.groupBy({
      by: ['membershipId'],
      where: { voidedAt: null, membership: active },
      having: { membershipId: { _count: { gte: RETURNING_MIN_STAMPS } } },
    });
    return {
      active: await db.membership.count({ where: active }),
      returning: returning.length,
      marketingConsent: await db.membership.count({
        where: { ...active, marketingConsent: true },
      }),
    };
  }

  private async period({ start, end }: ArRange): Promise<Stats['period']> {
    const { db } = this.tenant;
    const within = { gte: start, lt: end };
    const granted = { createdAt: within, voidedAt: null };
    return {
      joined: await db.membership.count({ where: { joinedAt: within } }),
      stamps: await db.stamp.count({ where: granted }),
      manualStamps: await db.stamp.count({
        where: { ...granted, source: 'MANUAL' },
      }),
      cooldownOverrides: await db.stamp.count({
        where: { ...granted, cooldownOverride: true },
      }),
      redemptions: await db.redemption.count({ where: granted }),
      voidedStamps: await db.stamp.count({ where: { voidedAt: within } }),
      voidedRedemptions: await db.redemption.count({
        where: { voidedAt: within },
      }),
    };
  }

  // Solo las fechas: se agrupan por día AR en TypeScript, con la misma
  // definición de día que el resto de la API.
  private async daily(range: ArRange): Promise<Stats['daily']> {
    const { db } = this.tenant;
    const within = { gte: range.start, lt: range.end };
    const granted = { createdAt: within, voidedAt: null };
    const joins = await db.membership.findMany({
      where: { joinedAt: within },
      select: { joinedAt: true },
    });
    const stamps = await db.stamp.findMany({
      where: granted,
      select: { createdAt: true },
    });
    const redemptions = await db.redemption.findMany({
      where: granted,
      select: { createdAt: true },
    });

    const days = arDaysOf(range);
    const joined = countByArDay(
      days,
      joins.map((m) => m.joinedAt),
    );
    const stamped = countByArDay(
      days,
      stamps.map((s) => s.createdAt),
    );
    const redeemed = countByArDay(
      days,
      redemptions.map((r) => r.createdAt),
    );
    return days.map((day, i) => ({
      day,
      joined: joined[i]!,
      stamps: stamped[i]!,
      redemptions: redeemed[i]!,
    }));
  }
}
