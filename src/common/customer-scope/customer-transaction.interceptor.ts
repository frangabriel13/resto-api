import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../modules/auth/sessions/session.guard.js';
import { CustomerContext } from './customer-context.js';

@Injectable()
export class CustomerTransactionInterceptor implements NestInterceptor {
  constructor(private readonly customer: CustomerContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return from(
      this.customer.run(auth.ownerId, () =>
        lastValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    );
  }
}
