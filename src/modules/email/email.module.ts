import { Global, Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender.js';
import { emailSenderProvider } from './email-sender.provider.js';

@Global()
@Module({
  providers: [emailSenderProvider],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
