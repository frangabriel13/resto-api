import { z } from 'zod';
import { AppException } from '../../../common/errors/app.exception.js';
import { errorBody, postJson } from '../../../common/post-json.js';
import type { OtpSender } from './otp-sender.js';

const MESSAGES_API = 'https://graph.facebook.com/v25.0';

export type WhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
};

const metaErrorSchema = z.object({ error: z.object({ code: z.number() }) });

export class WhatsAppOtpSender implements OtpSender {
  constructor(private readonly config: WhatsAppConfig) {}

  async send(phoneE164: string, code: string): Promise<void> {
    const response = await postJson(
      'WhatsApp',
      `${MESSAGES_API}/${this.config.phoneNumberId}/messages`,
      this.config.accessToken,
      otpTemplateMessage(phoneE164, code, this.config),
    ).catch((error: unknown) => {
      throw deliveryFailed(error);
    });
    if (!response.ok) {
      const parsed = metaErrorSchema.safeParse(await errorBody(response));
      const metaCode = parsed.success ? parsed.data.error.code : 'desconocido';
      throw deliveryFailed(
        new Error(`WhatsApp respondió ${response.status} (código ${metaCode})`),
      );
    }
  }
}

// Meta pide el código dos veces: en el texto y en el botón de copiar.
export function otpTemplateMessage(
  phoneE164: string,
  code: string,
  { templateName, templateLanguage }: WhatsAppConfig,
) {
  const codeParameter = [{ type: 'text', text: code }];
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsAppNumber(phoneE164),
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        { type: 'body', parameters: codeParameter },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: codeParameter,
        },
      ],
    },
  };
}

// Meta resuelve el celular argentino sin el 9 a la cuenta correcta; con el 9,
// la lista de destinatarios del número de prueba lo rechaza.
export function toWhatsAppNumber(phoneE164: string): string {
  return phoneE164.slice(1).replace(/^549/, '54');
}

// La causa lleva solo el estado y el código de Meta: nada del cliente.
function deliveryFailed(cause: unknown): AppException {
  return new AppException('OTP_DELIVERY_FAILED', undefined, undefined, {
    cause,
  });
}
