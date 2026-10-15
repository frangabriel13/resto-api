import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';

// Cliente admin: se conecta como `resto_app_admin` (BYPASSRLS). Usarlo solo
// en /admin/* y en la lectura pública de piezas; en cualquier otro lado
// saltearía el aislamiento entre comercios.
@Injectable()
export class PrismaAdminService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_ADMIN_URL', { infer: true }),
      }),
    });
  }

  async onModuleInit() {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
