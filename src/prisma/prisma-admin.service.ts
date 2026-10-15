import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { ConnectedPrismaClient } from './connected-prisma-client.js';

// Rol `resto_app_admin` (BYPASSRLS): solo para /admin/* y la lectura pública de piezas.
@Injectable()
export class PrismaAdminService extends ConnectedPrismaClient {
  constructor(config: ConfigService<Env, true>) {
    super(config.get('DATABASE_ADMIN_URL', { infer: true }));
  }
}
