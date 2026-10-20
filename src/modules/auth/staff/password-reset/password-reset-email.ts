import type { EmailMessage } from '../../../email/email-sender.js';

export function passwordResetEmail(
  to: string,
  appUrl: string,
  token: string,
  validMinutes: number,
): EmailMessage {
  const link = new URL('/panel/restablecer', appUrl);
  link.searchParams.set('token', token);
  return {
    to,
    subject: 'Restablecé tu contraseña de Clubsy',
    text: [
      'Pediste restablecer tu contraseña del panel de Clubsy.',
      `Entrá a este link para elegir una nueva (vence en ${validMinutes} minutos):`,
      link.toString(),
      'Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.',
    ].join('\n\n'),
  };
}
