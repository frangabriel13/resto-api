import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { CustomerScopeModule } from './common/customer-scope/customer-scope.module.js';
import { TenantModule } from './common/tenant/tenant.module.js';
import { createValidationPipe } from './common/validation.js';
import { validateEnv } from './config/env.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { SessionsModule } from './modules/auth/sessions/sessions.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { PanelCustomersModule } from './modules/panel-customers/panel-customers.module.js';
import { PiecesModule } from './modules/pieces/pieces.module.js';
import { RedemptionsModule } from './modules/redemptions/redemptions.module.js';
import { StampsModule } from './modules/stamps/stamps.module.js';
import { RewardRulesModule } from './modules/reward-rules/reward-rules.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Los límites se definen por ruta con @Throttle + ThrottlerGuard.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    SessionsModule,
    TenantModule,
    CustomerScopeModule,
    AuditModule,
    AuthModule,
    AdminModule,
    RewardRulesModule,
    PiecesModule,
    CustomersModule,
    MembershipsModule,
    StampsModule,
    RedemptionsModule,
    PanelCustomersModule,
  ],
  providers: [
    // Registrados acá (y no en main.ts) para que los E2E se comporten igual.
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
