import { createHash } from 'node:crypto';
import { generateToken, hashToken } from './tokens.js';

describe('tokens', () => {
  it('genera tokens aleatorios de 256 bits aptos para una cookie o una URL', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it('el hash es SHA-256 del token y no lo contiene', () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});
