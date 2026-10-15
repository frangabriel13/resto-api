import { generatePieceCode, PIECE_CODE_ALPHABET } from './piece-code.js';

describe('generatePieceCode', () => {
  it('genera códigos de 12 caracteres sin caracteres ambiguos', () => {
    const code = generatePieceCode();
    expect(code).toHaveLength(12);
    for (const char of code) expect(PIECE_CODE_ALPHABET).toContain(char);
  });

  it('no repite códigos', () => {
    const codes = new Set(Array.from({ length: 1000 }, generatePieceCode));
    expect(codes.size).toBe(1000);
  });
});
