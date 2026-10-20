import { Injectable, Logger } from '@nestjs/common';

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EmailSender');

// Solo desarrollo: en producción la API no arranca con EMAIL_SENDER=console.
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');

  send({ to, subject, text }: EmailMessage): Promise<void> {
    this.logger.log(`Para ${to} — ${subject}\n${text}`);
    return Promise.resolve();
  }
}
