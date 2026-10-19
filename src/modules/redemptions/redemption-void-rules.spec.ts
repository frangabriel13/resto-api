import {
  redemptionVoidDenial,
  validStampsInCycle,
  type RedemptionVoidCheck,
} from './redemption-void-rules.js';

const check = (
  overrides: Partial<RedemptionVoidCheck> = {},
): RedemptionVoidCheck => ({
  redemption: { cycle: 1, voidedAt: null },
  currentCycle: 2,
  newCycleStamps: 0,
  role: 'OWNER',
  ...overrides,
});

describe('redemptionVoidDenial', () => {
  it('el OWNER anula el último canje si el ciclo nuevo está vacío', () => {
    expect(redemptionVoidDenial(check())).toBeNull();
  });

  it('el EMPLOYEE nunca anula canjes', () => {
    expect(redemptionVoidDenial(check({ role: 'EMPLOYEE' }))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('no anula dos veces', () => {
    expect(
      redemptionVoidDenial(
        check({ redemption: { cycle: 1, voidedAt: new Date() } }),
      ),
    ).toBe('ALREADY_VOIDED');
  });

  it('solo el último canje', () => {
    expect(redemptionVoidDenial(check({ currentCycle: 3 }))).toBe('NOT_LAST');
  });

  it('no si el ciclo nuevo ya tiene sellos', () => {
    expect(redemptionVoidDenial(check({ newCycleStamps: 1 }))).toBe(
      'NEW_CYCLE_HAS_STAMPS',
    );
  });
});

describe('validStampsInCycle', () => {
  it('cuenta los sellos no anulados del ciclo', () => {
    const stamps = [
      { cycle: 2, voidedAt: null },
      { cycle: 2, voidedAt: new Date() },
      { cycle: 1, voidedAt: null },
    ];
    expect(validStampsInCycle(stamps, 2)).toBe(1);
  });
});
