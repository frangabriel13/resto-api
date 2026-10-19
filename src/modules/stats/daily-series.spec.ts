import { countByArDay } from './daily-series.js';

describe('countByArDay', () => {
  const days = ['2026-10-17', '2026-10-18', '2026-10-19'];

  it('cuenta por día de Buenos Aires y deja en cero los días sin movimiento', () => {
    expect(
      countByArDay(days, [
        new Date('2026-10-17T15:00:00Z'),
        // 23:30 del 17 en Argentina.
        new Date('2026-10-18T02:30:00Z'),
        new Date('2026-10-19T12:00:00Z'),
      ]),
    ).toEqual([2, 0, 1]);
  });

  it('ignora lo que cae fuera de los días pedidos', () => {
    expect(countByArDay(days, [new Date('2026-10-25T12:00:00Z')])).toEqual([
      0, 0, 0,
    ]);
  });
});
