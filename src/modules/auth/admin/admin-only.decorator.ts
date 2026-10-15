import { UseGuards } from '@nestjs/common';
import { SessionGuard } from '../sessions/session.guard.js';

// Rutas de /admin: usan PrismaAdminService (BYPASSRLS), nunca TenantContext.
export const AdminOnly = () => UseGuards(SessionGuard('admin'));
