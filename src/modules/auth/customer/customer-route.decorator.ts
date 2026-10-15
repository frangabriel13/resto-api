import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { CustomerTransactionInterceptor } from '../../../common/customer-scope/customer-transaction.interceptor.js';
import { CustomerGuard } from './customer.guard.js';

// Rutas /me: sesión de cliente y transacción con el cliente en CustomerContext.
export const CustomerRoute = () =>
  applyDecorators(
    UseGuards(CustomerGuard),
    UseInterceptors(CustomerTransactionInterceptor),
  );
