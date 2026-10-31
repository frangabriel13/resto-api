export type ImageType = { contentType: string; extension: string };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

// Por los primeros bytes, no por lo que dice el navegador: un SVG (que puede
// llevar código) o cualquier otra cosa renombrada no pasa.
export function detectImageType(file: Buffer): ImageType | null {
  if (startsWith(file, PNG))
    return { contentType: 'image/png', extension: 'png' };
  if (startsWith(file, JPEG))
    return { contentType: 'image/jpeg', extension: 'jpg' };
  if (isWebp(file)) return { contentType: 'image/webp', extension: 'webp' };
  return null;
}

function startsWith(file: Buffer, bytes: number[]): boolean {
  return file.length >= bytes.length && bytes.every((b, i) => file[i] === b);
}

// "RIFF" + 4 bytes de tamaño + "WEBP".
function isWebp(file: Buffer): boolean {
  return (
    file.length >= 12 &&
    file.toString('ascii', 0, 4) === 'RIFF' &&
    file.toString('ascii', 8, 12) === 'WEBP'
  );
}
