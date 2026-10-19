import { arDay } from '../../common/ar-time.js';

// Cuántos instantes caen en cada día AR de `days`, con ceros en los días sin
// movimiento.
export function countByArDay(days: string[], instants: Date[]): number[] {
  const index = new Map(days.map((day, i) => [day, i]));
  const counts = days.map(() => 0);
  for (const instant of instants) {
    const i = index.get(arDay(instant));
    if (i !== undefined) counts[i]!++;
  }
  return counts;
}
