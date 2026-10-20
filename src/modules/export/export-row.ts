import { arDateTime } from '../../common/ar-time.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { formatArNational } from '../customers/phone.js';
import {
  lastValidStampAt,
  panelBalance,
  panelMembershipInclude,
} from '../memberships/panel-membership.js';
import type { CsvValue } from './csv.js';

export const exportInclude = {
  ...panelMembershipInclude,
  joinedViaPiece: true,
} as const;

type MembershipForExport = Prisma.MembershipGetPayload<{
  include: typeof exportInclude;
}>;

export const EXPORT_HEADER = [
  'Nombre',
  'Teléfono',
  'Acepta comunicaciones',
  'Fecha de consentimiento',
  'Fecha de revocación',
  'Alta',
  'Salió del club',
  'Ciclo actual',
  'Sellos en el ciclo',
  'Sellos totales',
  'Canjes',
  'Último sello',
  'Pieza de origen',
];

export function exportRow(membership: MembershipForExport): CsvValue[] {
  const { customer } = membership;
  const balance = panelBalance(membership);
  const redemptions = membership.redemptions.filter((r) => !r.voidedAt);
  return [
    customer.deletedAt ? '(cuenta borrada)' : customer.name,
    customer.phoneE164 && formatArNational(customer.phoneE164),
    membership.marketingConsent ? 'Sí' : 'No',
    dateOrEmpty(membership.marketingConsentAt),
    dateOrEmpty(membership.marketingConsentRevokedAt),
    arDateTime(membership.joinedAt),
    dateOrEmpty(membership.leftAt),
    balance.cycle,
    balance.balance,
    balance.totalStamps,
    redemptions.length,
    dateOrEmpty(lastValidStampAt(membership)),
    membership.joinedViaPiece?.label ?? null,
  ];
}

function dateOrEmpty(instant: Date | null): string | null {
  return instant ? arDateTime(instant) : null;
}
