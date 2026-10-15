import { Prisma } from '../../generated/prisma/client.js';
import {
  addToWhere,
  CREATE_OPERATIONS,
  fillOnCreate,
  READ_OPERATIONS,
  WHERE_OPERATIONS,
  type QueryArgs,
} from '../request-scope/prisma-operations.js';

const SCOPED_BY_MERCHANT_ID = new Set([
  'StaffMembership',
  'Membership',
  'Piece',
  'RewardRule',
  'Stamp',
  'Redemption',
  'AuditEvent',
]);

const MERCHANT_OPERATIONS = new Set([...READ_OPERATIONS, 'update']);

// Agrega el comercio del contexto a toda consulta de las tablas de comercio.
// Las relaciones anidadas no pasan por acá: las protegen las FKs compuestas.
export function tenantScope(currentMerchantId: () => string | undefined) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const merchantId = currentMerchantId();
          if (!merchantId) return query(args);
          return query(
            scopeArgs(model, operation, args as QueryArgs, merchantId),
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
  merchantId: string,
): QueryArgs {
  if (model === 'Customer') {
    throw new Error(
      'En el panel, los clientes se leen a través de una membresía del comercio',
    );
  }
  if (model === 'Merchant') {
    if (!MERCHANT_OPERATIONS.has(operation)) {
      throw new Error(`El panel no puede hacer ${operation} sobre Merchant`);
    }
    return addToWhere(args, { id: merchantId });
  }
  if (!SCOPED_BY_MERCHANT_ID.has(model)) return args;

  let scoped = args;
  if (WHERE_OPERATIONS.has(operation)) {
    scoped = addToWhere(scoped, { merchantId });
  }
  if (CREATE_OPERATIONS.has(operation)) {
    scoped = fillOnCreate(operation, scoped, 'merchantId', merchantId);
  }
  return scoped;
}
