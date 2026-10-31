import { detectImageType } from './image-type.js';
import { keyFromPublicUrl } from './image-storage.js';

const bytes = (...values: number[]) => Buffer.from(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  bytes(0x24, 0, 0, 0),
  Buffer.from('WEBPVP8 '),
]);

describe('detectImageType', () => {
  it.each([
    ['PNG', PNG, { contentType: 'image/png', extension: 'png' }],
    ['JPEG', JPEG, { contentType: 'image/jpeg', extension: 'jpg' }],
    ['WebP', WEBP, { contentType: 'image/webp', extension: 'webp' }],
  ])('reconoce %s por su contenido', (_, file, type) => {
    expect(detectImageType(file)).toEqual(type);
  });

  it.each([
    ['un SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['un GIF', Buffer.from('GIF89a......')],
    ['un PDF', Buffer.from('%PDF-1.7')],
    [
      'un RIFF que no es WebP',
      Buffer.concat([
        Buffer.from('RIFF'),
        bytes(0, 0, 0, 0),
        Buffer.from('WAVE'),
      ]),
    ],
    ['un PNG cortado', PNG.subarray(0, 4)],
    ['un archivo vacío', Buffer.alloc(0)],
  ])('rechaza %s', (_, file) => {
    expect(detectImageType(file)).toBeNull();
  });
});

describe('keyFromPublicUrl', () => {
  const base = 'https://img.clubsy.com.ar';

  it('saca la clave de una URL del bucket', () => {
    expect(keyFromPublicUrl(base, `${base}/merchants/abc/cover-x1.webp`)).toBe(
      'merchants/abc/cover-x1.webp',
    );
  });

  it('una URL de otro lado no es del bucket', () => {
    expect(keyFromPublicUrl(base, 'https://cdn.com/logo.png')).toBeNull();
    expect(
      keyFromPublicUrl(base, 'https://img.clubsy.com.ar.evil.com/x.png'),
    ).toBeNull();
  });
});
