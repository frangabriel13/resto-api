import { createHash } from 'node:crypto';
import { generateSessionToken, hashSessionToken } from './session-token.js';

describe('session token', () => {
  it('genera tokens aleatorios de 256 bits aptos para una cookie', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSessionToken()).not.toBe(token);
  });

  it('el hash es SHA-256 del token y no lo contiene', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});
