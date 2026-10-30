import { arDay } from '../../common/ar-time.js';
import { toCsv } from './csv.js';
import {
  EXPORT_HEADER,
  exportRow,
  type MembershipForExport,
} from './export-row.js';

export type CustomersExport = { filename: string; csv: string };

// El mismo archivo para el dueño (panel) y para el admin.
export function customersExport(
  slug: string,
  memberships: MembershipForExport[],
): CustomersExport {
  return {
    filename: `clubsy-${slug}-${arDay(new Date())}.csv`,
    csv: toCsv([EXPORT_HEADER, ...memberships.map(exportRow)]),
  };
}
