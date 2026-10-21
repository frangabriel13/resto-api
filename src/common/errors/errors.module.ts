import { Global, Module } from '@nestjs/common';
import { ErrorReporter } from './error-reporter.js';

@Global()
@Module({
  providers: [ErrorReporter],
  exports: [ErrorReporter],
})
export class ErrorsModule {}
