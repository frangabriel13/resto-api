import { cooldownRemainingSeconds } from './cooldown.js';

const NOW = new Date('2026-10-16T12:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

describe('cooldownRemainingSeconds', () => {
  it('sin sellos previos no hay cooldown', () => {
    expect(cooldownRemainingSeconds(null, 60, NOW)).toBe(0);
  });

  it('dentro del cooldown devuelve lo que falta', () => {
    expect(cooldownRemainingSeconds(minutesAgo(10), 60, NOW)).toBe(50 * 60);
    expect(
      cooldownRemainingSeconds(new Date(NOW.getTime() - 500), 1, NOW),
    ).toBe(60);
  });

  it('cumplido el cooldown devuelve 0', () => {
    expect(cooldownRemainingSeconds(minutesAgo(60), 60, NOW)).toBe(0);
    expect(cooldownRemainingSeconds(minutesAgo(90), 60, NOW)).toBe(0);
  });

  it('con cooldown 0 nunca bloquea', () => {
    expect(cooldownRemainingSeconds(NOW, 0, NOW)).toBe(0);
  });
});
