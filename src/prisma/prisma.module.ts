import { Global, Module } from '@nestjs/common';
import { PrismaAdminService } from './prisma-admin.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, PrismaAdminService],
  exports: [PrismaService, PrismaAdminService],
})
export class PrismaModule {}
