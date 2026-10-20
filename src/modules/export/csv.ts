const SEPARATOR = ';';
const EOL = '\r\n';
// Para que Excel abra bien los acentos.
const BOM = '﻿';
// Excel ejecuta como fórmula un campo que empieza así (inyección en CSV,
// OWASP): el nombre lo escribe el cliente.
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;

export type CsvValue = string | number | null;

// Separado por ";", que es lo que espera Excel con configuración argentina.
export function toCsv(rows: CsvValue[][]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(SEPARATOR)).join(EOL);
}

function csvCell(value: CsvValue): string {
  let text = value === null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
