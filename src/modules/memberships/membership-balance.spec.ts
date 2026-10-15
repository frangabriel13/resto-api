import { calculateBalance, type BalanceInput } from './membership-balance.js';

const RULE_ID = 'regla-v1';
const VOIDED = new Date('2026-10-01T12:00:00Z');

const stamp = (cycle: number, voided = false) => ({
  cycle,
  voidedAt: voided ? VOIDED : null,
});

const redemption = (cycle: number, carryOver: number, voided = false) => ({
  cycle,
  carryOver,
  voidedAt: voided ? VOIDED : null,
});

const input = (overrides: Partial<BalanceInput> = {}): BalanceInput => ({
  membership: { currentCycle: 1, currentCycleRewardRuleId: RULE_ID },
  cycleRule: { id: RULE_ID, stampsRequired: 8 },
  stamps: [],
  redemptions: [],
  ...overrides,
});

describe('calculateBalance', () => {
  it('una membresía nueva arranca en cero', () => {
    expect(calculateBalance(input())).toEqual({
      cycle: 1,
      stampsRequired: 8,
      cycleStamps: 0,
      carryOver: 0,
      balance: 0,
      remaining: 8,
      canRedeem: false,
      totalStamps: 0,
    });
  });

  it('cuenta los sellos del ciclo y cuántos faltan', () => {
    const balance = calculateBalance(
      input({ stamps: [stamp(1), stamp(1), stamp(1)] }),
    );
    expect(balance).toMatchObject({
      cycleStamps: 3,
      balance: 3,
      remaining: 5,
      canRedeem: false,
      totalStamps: 3,
    });
  });

  it('no cuenta los sellos anulados ni en el ciclo ni en el histórico', () => {
    const balance = calculateBalance(
      input({ stamps: [stamp(1), stamp(1, true), stamp(1)] }),
    );
    expect(balance).toMatchObject({ cycleStamps: 2, totalStamps: 2 });
  });

  it('con los sellos justos puede canjear y no falta ninguno', () => {
    const balance = calculateBalance(
      input({ stamps: Array.from({ length: 8 }, () => stamp(1)) }),
    );
    expect(balance).toMatchObject({
      balance: 8,
      remaining: 0,
      canRedeem: true,
    });
  });

  it('los sellos de más se acumulan en el saldo, no se pierden', () => {
    const balance = calculateBalance(
      input({ stamps: Array.from({ length: 10 }, () => stamp(1)) }),
    );
    expect(balance).toMatchObject({
      balance: 10,
      remaining: 0,
      canRedeem: true,
    });
  });

  it('en un ciclo nuevo suma el sobrante del canje anterior', () => {
    const balance = calculateBalance(
      input({
        membership: { currentCycle: 2, currentCycleRewardRuleId: RULE_ID },
        stamps: [...Array.from({ length: 9 }, () => stamp(1)), stamp(2)],
        redemptions: [redemption(1, 1)],
      }),
    );
    expect(balance).toEqual({
      cycle: 2,
      stampsRequired: 8,
      cycleStamps: 1,
      carryOver: 1,
      balance: 2,
      remaining: 6,
      canRedeem: false,
      totalStamps: 10,
    });
  });

  it('solo suma el sobrante del canje que cerró el ciclo anterior', () => {
    const balance = calculateBalance(
      input({
        membership: { currentCycle: 3, currentCycleRewardRuleId: RULE_ID },
        redemptions: [redemption(1, 2), redemption(2, 0)],
      }),
    );
    expect(balance.carryOver).toBe(0);
  });

  it('ignora los canjes anulados', () => {
    const balance = calculateBalance(
      input({
        membership: { currentCycle: 2, currentCycleRewardRuleId: RULE_ID },
        redemptions: [redemption(1, 5, true), redemption(1, 2)],
      }),
    );
    expect(balance.carryOver).toBe(2);
  });

  it('después de anular el canje vuelve al ciclo anterior con sus sellos', () => {
    const balance = calculateBalance(
      input({
        stamps: Array.from({ length: 9 }, () => stamp(1)),
        redemptions: [redemption(1, 1, true)],
      }),
    );
    expect(balance).toMatchObject({
      cycle: 1,
      cycleStamps: 9,
      carryOver: 0,
      balance: 9,
      canRedeem: true,
    });
  });

  it('usa los sellos requeridos de la regla del ciclo', () => {
    const balance = calculateBalance(
      input({
        membership: { currentCycle: 1, currentCycleRewardRuleId: 'regla-v2' },
        cycleRule: { id: 'regla-v2', stampsRequired: 5 },
        stamps: Array.from({ length: 5 }, () => stamp(1)),
      }),
    );
    expect(balance).toMatchObject({ stampsRequired: 5, canRedeem: true });
  });

  it('rechaza una regla que no es la del ciclo actual', () => {
    expect(() =>
      calculateBalance(
        input({ cycleRule: { id: 'otra-regla', stampsRequired: 8 } }),
      ),
    ).toThrow('no es la del ciclo actual');
  });
});
