import { Prisma } from '../../generated/prisma/client.js';
import {
  addToWhere,
  CREATE_OPERATIONS,
  fillOnCreate,
  READ_OPERATIONS,
  type QueryArgs,
} from '../request-scope/prisma-operations.js';

const READ_ONLY_MODELS = new Set(['Merchant', 'RewardRule', 'Piece']);
const READ_THROUGH_MEMBERSHIP = new Set(['Stamp', 'Redemption']);
const MEMBERSHIP_OPERATIONS = new Set([
  ...READ_OPERATIONS,
  'create',
  'update',
  'updateMany',
  'upsert',
]);
const CUSTOMER_OPERATIONS = new Set([...READ_OPERATIONS, 'update']);

// El cliente solo ve su cuenta, sus membresías y lo que cuelga de ellas. Los
// datos públicos del comercio (marca, regla, piezas) son de solo lectura.
export function customerScope(currentCustomerId: () => string | undefined) {
  return Prisma.defineExtension({
    name: 'customer-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const customerId = currentCustomerId();
          if (!customerId) return query(args);
          return query(
            scopeArgs(model, operation, args as QueryArgs, customerId),
          );
        },
      },
    },
  });
}

function scopeArgs(
  model: string,
  operation: string,
  args: QueryArgs,
  customerId: string,
): QueryArgs {
  if (model === 'Customer') {
    assertAllowed(CUSTOMER_OPERATIONS, model, operation);
    return addToWhere(args, { id: customerId });
  }
  if (model === 'Membership') {
    assertAllowed(MEMBERSHIP_OPERATIONS, model, operation);
    const scoped = CREATE_OPERATIONS.has(operation)
      ? fillOnCreate(operation, args, 'customerId', customerId)
      : args;
    return operation === 'create' ? scoped : addToWhere(scoped, { customerId });
  }
  if (READ_THROUGH_MEMBERSHIP.has(model)) {
    assertAllowed(READ_OPERATIONS, model, operation);
    return addToWhere(args, { membership: { customerId } });
  }
  if (READ_ONLY_MODELS.has(model)) {
    assertAllowed(READ_OPERATIONS, model, operation);
    return args;
  }
  throw new Error(`El cliente no puede acceder a ${model}`);
}

function assertAllowed(allowed: Set<string>, model: string, operation: string) {
  if (!allowed.has(operation)) {
    throw new Error(`El cliente no puede hacer ${operation} sobre ${model}`);
  }
}
