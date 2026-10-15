import {
  parsePhoneNumberFromString,
  type PhoneNumber,
} from 'libphonenumber-js/max';

// Celulares argentinos en E.164 (+549…). Mucha gente escribe el celular sin
// el 15 ni el 9 y así parece un fijo: en ese caso se prueba con el 9.
export function normalizeArMobile(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input, 'AR');
  if (!parsed || parsed.country !== 'AR') return null;
  if (isMobile(parsed)) return parsed.number;

  const withMobilePrefix = parsePhoneNumberFromString(
    `+549${parsed.nationalNumber}`,
  );
  return withMobilePrefix && isMobile(withMobilePrefix)
    ? withMobilePrefix.number
    : null;
}

// "11 ••• 6789": código de área y últimos cuatro dígitos.
export function maskPhone(phoneE164: string): string {
  const parsed = parsePhoneNumberFromString(phoneE164);
  const last4 = phoneE164.slice(-4);
  const areaCode = parsed?.formatNational().split(' ')[0]?.replace(/^0/, '');
  return areaCode ? `${areaCode} ••• ${last4}` : `••• ${last4}`;
}

function isMobile(phone: PhoneNumber): boolean {
  return phone.isValid() && phone.getType() === 'MOBILE';
}
