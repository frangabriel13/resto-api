import { Injectable, Logger } from '@nestjs/common';

export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
}

export const OTP_SENDER = Symbol('OtpSender');

// Solo desarrollo: en producción la API no arranca con OTP_SENDER=console.
@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger('OTP');

  send(phoneE164: string, code: string): Promise<void> {
    this.logger.log(`Código para ${phoneE164}: ${code}`);
    return Promise.resolve();
  }
}
