import { Global, Module } from '@nestjs/common';
import { CustomerContext } from './customer-context.js';

@Global()
@Module({
  providers: [CustomerContext],
  exports: [CustomerContext],
})
export class CustomerScopeModule {}
