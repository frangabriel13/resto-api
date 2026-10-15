import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { TenantContext, type TenantScope } from './tenant-context.js';

export type TenantRequest = Request & { tenant: TenantScope };

@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(private readonly tenant: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { tenant } = context.switchToHttp().getRequest<TenantRequest>();
    return from(
      this.tenant.run(tenant, () =>
        lastValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    );
  }
}
