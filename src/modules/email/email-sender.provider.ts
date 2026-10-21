import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import {
  ConsoleEmailSender,
  EMAIL_SENDER,
  type EmailSender,
} from './email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

export const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): EmailSender =>
    config.get('EMAIL_SENDER', { infer: true }) === 'resend'
      ? new ResendEmailSender({
          apiKey: config.getOrThrow('RESEND_API_KEY', { infer: true }),
          from: config.getOrThrow('EMAIL_FROM', { infer: true }),
        })
      : new ConsoleEmailSender(),
};
