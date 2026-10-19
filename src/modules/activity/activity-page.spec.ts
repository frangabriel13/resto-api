import {
  compareEvents,
  decodeCursor,
  encodeCursor,
  takePage,
  type ActivityKey,
} from './activity-page.js';

const UUID_A = '01a15453-60c3-736d-bacc-88e360eb84d4';
const UUID_B = '01a15453-60c3-736d-bacc-88e360eb84d5';
const at = (iso: string) => new Date(iso);

describe('compareEvents', () => {
  it('ordena de lo más nuevo a lo más viejo y desempata por id', () => {
    const events: ActivityKey[] = [
      { at: at('2026-10-18T10:00:00Z'), id: `STAMP:${UUID_A}` },
      { at: at('2026-10-18T11:00:00Z'), id: `JOINED:${UUID_A}` },
      { at: at('2026-10-18T10:00:00Z'), id: `STAMP:${UUID_B}` },
    ];
    expect(events.sort(compareEvents).map((e) => e.id)).toEqual([
      `JOINED:${UUID_A}`,
      `STAMP:${UUID_B}`,
      `STAMP:${UUID_A}`,
    ]);
  });
});

describe('takePage', () => {
  const events = [1, 2, 3].map((minute) => ({
    at: at(`2026-10-18T10:0${minute}:00Z`),
    id: `STAMP:${UUID_A}`.replace(/.$/, String(minute)),
  }));

  it('corta la página y devuelve desde dónde sigue', () => {
    const page = takePage(events, 2);
    expect(page.items.map((e) => e.at.getUTCMinutes())).toEqual([3, 2]);
    expect(page.next).toEqual(page.items[1]);
  });

  it('en la última página no hay cursor', () => {
    expect(takePage(events, 3).next).toBeNull();
  });
});

describe('cursor', () => {
  it('vuelve igual después de codificarlo', () => {
    const key = { at: at('2026-10-18T10:00:00.123Z'), id: `STAMP:${UUID_A}` };
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it('rechaza un cursor mal formado', () => {
    expect(decodeCursor('no-es-un-cursor')).toBeNull();
    const forged = Buffer.from('{"at":"ayer","id":"x"}').toString('base64url');
    expect(decodeCursor(forged)).toBeNull();
  });
});
