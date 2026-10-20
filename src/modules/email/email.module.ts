import { Global, Module } from '@nestjs/common';
import { ConsoleEmailSender, EMAIL_SENDER } from './email-sender.js';

@Global()
@Module({
  providers: [{ provide: EMAIL_SENDER, useClass: ConsoleEmailSender }],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
