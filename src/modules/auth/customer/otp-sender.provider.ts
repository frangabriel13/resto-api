import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import { ConsoleOtpSender, OTP_SENDER, type OtpSender } from './otp-sender.js';
import { WhatsAppOtpSender } from './whatsapp-otp-sender.js';

export const otpSenderProvider: Provider = {
  provide: OTP_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): OtpSender =>
    config.get('OTP_SENDER', { infer: true }) === 'whatsapp'
      ? new WhatsAppOtpSender({
          phoneNumberId: config.getOrThrow('WHATSAPP_PHONE_NUMBER_ID', {
            infer: true,
          }),
          accessToken: config.getOrThrow('WHATSAPP_ACCESS_TOKEN', {
            infer: true,
          }),
          templateName: config.getOrThrow('WHATSAPP_TEMPLATE_NAME', {
            infer: true,
          }),
          templateLanguage: config.get('WHATSAPP_TEMPLATE_LANGUAGE', {
            infer: true,
          }),
        })
      : new ConsoleOtpSender(),
};
