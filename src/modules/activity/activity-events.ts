import type { Prisma, StaffRole } from '../../generated/prisma/client.js';
import { panelPhone } from '../memberships/panel-membership.js';
import { staffNameSelect } from '../staff/staff-name.js';
import { eventId } from './activity-page.js';
import type { ActivityEvent } from './activity.schemas.js';

// Con `at` como Date hasta armar la página; se serializa al final.
export type DatedEvent = ActivityEvent extends infer E
  ? E extends ActivityEvent
    ? Omit<E, 'at'> & { at: Date }
    : never
  : never;

const withCustomer = { include: { customer: true } } as const;

export const stampInclude = {
  membership: withCustomer,
  grantedBy: staffNameSelect,
  voidedBy: staffNameSelect,
} as const;

export const redemptionInclude = {
  membership: withCustomer,
  rewardRule: true,
  confirmedBy: staffNameSelect,
  voidedBy: staffNameSelect,
} as const;

export const joinInclude = { customer: true, joinedViaPiece: true } as const;

type StampRow = Prisma.StampGetPayload<{ include: typeof stampInclude }>;
type RedemptionRow = Prisma.RedemptionGetPayload<{
  include: typeof redemptionInclude;
}>;
type JoinRow = Prisma.MembershipGetPayload<{ include: typeof joinInclude }>;
type MembershipWithCustomer = Prisma.MembershipGetPayload<typeof withCustomer>;

function customerOf(membership: MembershipWithCustomer, role: StaffRole) {
  return {
    membershipId: membership.id,
    name: membership.customer.name,
    phone: panelPhone(membership.customer.phoneE164, role),
  };
}

export function stampEvent(stamp: StampRow, role: StaffRole): DatedEvent {
  return {
    type: 'STAMP',
    id: eventId('STAMP', stamp.id),
    at: stamp.createdAt,
    customer: customerOf(stamp.membership, role),
    by: stamp.grantedBy.staffUser.name,
    source: stamp.source,
    cooldownOverride: stamp.cooldownOverride,
    voided: stamp.voidedAt !== null,
  };
}

export function stampVoidedEvent(stamp: StampRow, role: StaffRole): DatedEvent {
  return {
    type: 'STAMP_VOIDED',
    id: eventId('STAMP_VOIDED', stamp.id),
    at: stamp.voidedAt!,
    customer: customerOf(stamp.membership, role),
    by: stamp.voidedBy!.staffUser.name,
    reason: stamp.voidReason,
  };
}

export function redemptionEvent(
  redemption: RedemptionRow,
  role: StaffRole,
): DatedEvent {
  return {
    type: 'REDEMPTION',
    id: eventId('REDEMPTION', redemption.id),
    at: redemption.createdAt,
    customer: customerOf(redemption.membership, role),
    by: redemption.confirmedBy.staffUser.name,
    cycle: redemption.cycle,
    rewardDescription: redemption.rewardRule.rewardDescription,
    voided: redemption.voidedAt !== null,
  };
}

export function redemptionVoidedEvent(
  redemption: RedemptionRow,
  role: StaffRole,
): DatedEvent {
  return {
    type: 'REDEMPTION_VOIDED',
    id: eventId('REDEMPTION_VOIDED', redemption.id),
    at: redemption.voidedAt!,
    customer: customerOf(redemption.membership, role),
    by: redemption.voidedBy!.staffUser.name,
    reason: redemption.voidReason,
  };
}

export function joinedEvent(membership: JoinRow, role: StaffRole): DatedEvent {
  return {
    type: 'JOINED',
    id: eventId('JOINED', membership.id),
    at: membership.joinedAt,
    customer: customerOf(membership, role),
    pieceLabel: membership.joinedViaPiece?.label ?? null,
    marketingConsent: membership.marketingConsent,
  };
}
