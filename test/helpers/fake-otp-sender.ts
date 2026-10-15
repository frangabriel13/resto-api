import type { OtpSender } from './../../src/modules/auth/customer/otp-sender.js';

export class FakeOtpSender implements OtpSender {
  readonly sent: { phone: string; code: string }[] = [];

  send(phone: string, code: string) {
    this.sent.push({ phone, code });
    return Promise.resolve();
  }

  get lastCode(): string {
    const last = this.sent.at(-1);
    if (!last) throw new Error('No se envió ningún código');
    return last.code;
  }
}
