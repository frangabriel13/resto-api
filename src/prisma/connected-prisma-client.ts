import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export abstract class ConnectedPrismaClient
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(connectionString: string) {
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // El pool conecta recién en la primera consulta: así la API no levanta sin base.
  async onModuleInit() {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
