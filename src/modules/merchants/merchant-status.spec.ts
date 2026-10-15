import { isAllowedTransition } from './merchant-status.js';

describe('isAllowedTransition', () => {
  it.each([
    ['DRAFT', 'ACTIVE'],
    ['ACTIVE', 'PAUSED'],
    ['ACTIVE', 'ENDED'],
    ['PAUSED', 'ACTIVE'],
    ['PAUSED', 'ENDED'],
    ['ACTIVE', 'ACTIVE'],
  ] as const)('permite %s → %s', (from, to) => {
    expect(isAllowedTransition(from, to)).toBe(true);
  });

  it.each([
    ['DRAFT', 'PAUSED'],
    ['DRAFT', 'ENDED'],
    ['ACTIVE', 'DRAFT'],
    ['PAUSED', 'DRAFT'],
    ['ENDED', 'ACTIVE'],
    ['ENDED', 'PAUSED'],
  ] as const)('rechaza %s → %s', (from, to) => {
    expect(isAllowedTransition(from, to)).toBe(false);
  });
});
