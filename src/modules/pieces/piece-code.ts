import { customAlphabet } from 'nanoid';

// Sin caracteres ambiguos (0/o, 1/l/i): el código puede leerse impreso.
export const PIECE_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export const generatePieceCode = customAlphabet(PIECE_CODE_ALPHABET, 12);
