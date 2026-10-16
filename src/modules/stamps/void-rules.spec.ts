import { voidDenial, type VoidCheck } from './void-rules.js';

const NOW = new Date('2026-10-16T12:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

const check = (overrides: Partial<VoidCheck> = {}): VoidCheck => ({
  stamp: {
    grantedByStaffId: 'empleado',
    createdAt: minutesAgo(2),
    cycle: 1,
    voidedAt: null,
  },
  currentCycle: 1,
  role: 'EMPLOYEE',
  staffUserId: 'empleado',
  now: NOW,
  ...overrides,
});

describe('voidDenial', () => {
  it('el EMPLOYEE anula su propio sello dentro de los 5 minutos', () => {
    expect(voidDenial(check())).toBeNull();
    expect(
      voidDenial(
        check({ stamp: { ...check().stamp, createdAt: minutesAgo(5) } }),
      ),
    ).toBeNull();
  });

  it('el EMPLOYEE no anula pasados los 5 minutos ni un sello ajeno', () => {
    expect(
      voidDenial(
        check({ stamp: { ...check().stamp, createdAt: minutesAgo(5.1) } }),
      ),
    ).toBe('NOT_ALLOWED');
    expect(voidDenial(check({ staffUserId: 'otro' }))).toBe('NOT_ALLOWED');
  });

  it('el OWNER anula cualquier sello, sin límite de tiempo', () => {
    const old = { ...check().stamp, createdAt: minutesAgo(600) };
    expect(
      voidDenial(check({ role: 'OWNER', staffUserId: 'duena', stamp: old })),
    ).toBeNull();
  });

  it('nadie anula un sello de un ciclo ya canjeado ni uno ya anulado', () => {
    expect(voidDenial(check({ role: 'OWNER', currentCycle: 2 }))).toBe(
      'REDEEMED_CYCLE',
    );
    expect(
      voidDenial(
        check({ role: 'OWNER', stamp: { ...check().stamp, voidedAt: NOW } }),
      ),
    ).toBe('ALREADY_VOIDED');
  });
});
