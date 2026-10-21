import { z } from 'zod';
import { errorBody, postJson } from '../../common/post-json.js';
import type { EmailMessage, EmailSender } from './email-sender.js';

const EMAILS_API = 'https://api.resend.com/emails';

export type ResendConfig = { apiKey: string; from: string };

// Del error de Resend se usa solo el tipo: el mensaje puede traer el email.
const resendErrorSchema = z.object({ name: z.string() });

export class ResendEmailSender implements EmailSender {
  constructor(private readonly config: ResendConfig) {}

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    const response = await postJson('Resend', EMAILS_API, this.config.apiKey, {
      from: this.config.from,
      to,
      subject,
      text,
    });
    if (!response.ok) {
      const parsed = resendErrorSchema.safeParse(await errorBody(response));
      const kind = parsed.success ? parsed.data.name : 'desconocido';
      throw new Error(`Resend respondió ${response.status} (${kind})`);
    }
  }
}
