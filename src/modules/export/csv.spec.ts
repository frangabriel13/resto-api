import { toCsv } from './csv.js';

const body = (csv: string) => csv.slice(1);

describe('toCsv', () => {
  it('empieza con BOM, separa con ; y termina las filas con CRLF', () => {
    const csv = toCsv([
      ['Nombre', 'Sellos'],
      ['Ana', 3],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(body(csv)).toBe('Nombre;Sellos\r\nAna;3');
  });

  it('deja vacío lo que no tiene valor', () => {
    expect(body(toCsv([['Ana', null, 'x']]))).toBe('Ana;;x');
  });

  it('entrecomilla lo que tiene ; comillas o saltos de línea', () => {
    expect(body(toCsv([['Ana; la del "café"', 'dos\nlíneas']]))).toBe(
      '"Ana; la del ""café""";"dos\nlíneas"',
    );
  });

  it('neutraliza lo que Excel tomaría como fórmula', () => {
    expect(
      body(toCsv([['=HYPERLINK("http://x")', '+54', '-1', '@SUM(A1)']])),
    ).toBe(`"'=HYPERLINK(""http://x"")";'+54;'-1;'@SUM(A1)`);
  });
});
