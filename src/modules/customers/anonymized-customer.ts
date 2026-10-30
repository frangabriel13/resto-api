// Lo que deja de una cuenta borrada, por el cliente (DELETE /me) o con el
// comercio desde el admin: los sellos y canjes quedan sin datos personales.
export function anonymizedCustomerData(now: Date) {
  return { name: null, phoneE164: null, phoneVerifiedAt: null, deletedAt: now };
}
