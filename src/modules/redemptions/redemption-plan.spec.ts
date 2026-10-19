import { planRedemption } from './redemption-plan.js';

describe('planRedemption', () => {
  it('no canjea si el saldo no alcanza', () => {
    expect(planRedemption({ balance: 7, stampsRequired: 8 })).toBeNull();
  });

  it('con el saldo justo no queda sobrante', () => {
    expect(planRedemption({ balance: 8, stampsRequired: 8 })).toEqual({
      stampsUsed: 8,
      carryOver: 0,
    });
  });

  it('los sellos de más pasan al ciclo siguiente', () => {
    expect(planRedemption({ balance: 11, stampsRequired: 8 })).toEqual({
      stampsUsed: 8,
      carryOver: 3,
    });
  });
});
