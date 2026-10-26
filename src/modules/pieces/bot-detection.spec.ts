import { describe, expect, it } from 'vitest';
import { isLikelyBot } from './bot-detection.js';

describe('isLikelyBot', () => {
  it('marca user-agents conocidos de bots', () => {
    expect(isLikelyBot('facebookexternalhit/1.1')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isLikelyBot('WhatsApp/2.23')).toBe(true);
  });

  it('no marca un navegador normal', () => {
    expect(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe(
      false,
    );
  });

  it('sin user-agent, no asume que es bot', () => {
    expect(isLikelyBot(undefined)).toBe(false);
  });
});
