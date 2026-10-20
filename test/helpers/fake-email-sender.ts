import type {
  EmailMessage,
  EmailSender,
} from './../../src/modules/email/email-sender.js';

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage) {
    this.sent.push(message);
    return Promise.resolve();
  }

  // El token del link de recuperación del último mail.
  get lastResetToken(): string {
    const last = this.sent.at(-1);
    const link = last?.text.match(/https?:\/\/\S+/)?.[0];
    const token = link && new URL(link).searchParams.get('token');
    if (!token) throw new Error('No se mandó ningún link de recuperación');
    return token;
  }
}
