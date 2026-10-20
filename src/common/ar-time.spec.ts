import { arDateTime, arDay, arDaysOf, resolveArRange } from './ar-time.js';

const NOW = new Date('2026-10-19T15:00:00Z');

describe('arDay', () => {
  it('a las 23:30 de Buenos Aires sigue siendo el mismo día', () => {
    expect(arDay(new Date('2026-10-19T02:30:00Z'))).toBe('2026-10-18');
    expect(arDay(new Date('2026-10-19T03:00:00Z'))).toBe('2026-10-19');
  });
});

describe('arDateTime', () => {
  it('muestra la fecha y la hora de Buenos Aires', () => {
    expect(arDateTime(new Date('2026-10-19T02:30:45Z'))).toBe(
      '2026-10-18 23:30',
    );
  });
});

describe('resolveArRange', () => {
  it('un día va de la medianoche a la medianoche de Buenos Aires', () => {
    expect(
      resolveArRange({ from: '2026-10-18', to: '2026-10-18' }, 1, NOW),
    ).toEqual({
      from: '2026-10-18',
      to: '2026-10-18',
      start: new Date('2026-10-18T03:00:00Z'),
      end: new Date('2026-10-19T03:00:00Z'),
    });
  });

  it('sin fechas toma los últimos días hasta hoy', () => {
    expect(resolveArRange({}, 1, NOW)).toMatchObject({
      from: '2026-10-19',
      to: '2026-10-19',
    });
    expect(resolveArRange({}, 30, NOW)).toMatchObject({
      from: '2026-09-20',
      to: '2026-10-19',
    });
    expect(resolveArRange({ to: '2026-10-10' }, 30, NOW)).toMatchObject({
      from: '2026-09-11',
      to: '2026-10-10',
    });
  });

  it('rechaza un rango invertido o de más de 366 días', () => {
    expect(
      resolveArRange({ from: '2026-10-19', to: '2026-10-18' }, 1, NOW),
    ).toBeNull();
    expect(
      resolveArRange({ from: '2025-01-01', to: '2026-01-02' }, 1, NOW),
    ).toBeNull();
    expect(
      resolveArRange({ from: '2025-01-01', to: '2026-01-01' }, 1, NOW),
    ).not.toBeNull();
  });
});

describe('arDaysOf', () => {
  it('lista los días del rango, incluido el cambio de mes', () => {
    const range = resolveArRange(
      { from: '2026-09-29', to: '2026-10-02' },
      1,
      NOW,
    )!;
    expect(arDaysOf(range)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});
