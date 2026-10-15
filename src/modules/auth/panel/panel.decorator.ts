import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { TenantTransactionInterceptor } from '../../../common/tenant/tenant-transaction.interceptor.js';
import { StaffGuard } from '../staff/staff.guard.js';
import { TenantGuard } from './tenant.guard.js';

// Rutas del panel: sesión de staff, comercio seleccionado y transacción con
// el comercio en TenantContext. Combinar con @Roles('OWNER') si hace falta.
export const Panel = () =>
  applyDecorators(
    UseGuards(StaffGuard, TenantGuard),
    UseInterceptors(TenantTransactionInterceptor),
  );
