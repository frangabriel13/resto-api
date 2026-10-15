import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { ConnectedPrismaClient } from './connected-prisma-client.js';

// Rol `resto_app`, sujeto a RLS.
@Injectable()
export class PrismaService extends ConnectedPrismaClient {
  constructor(config: ConfigService<Env, true>) {
    super(config.get('DATABASE_URL', { infer: true }));
  }
}
