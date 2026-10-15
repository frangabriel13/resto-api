import { Prisma } from '../../generated/prisma/client.js';

const SCOPED_BY_MERCHANT_ID = new Set<string>([
  'StaffMembership',
  'Membership',
  'Piece',
  'RewardRule',
  'Stamp',
  'Redemption',
  'AuditEvent',
]);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

const MERCHANT_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'update',
]);

const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
]);

type Args = { where?: object; data?: unknown; create?: object };

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
          return query(scopeArgs(model, operation, args as Args, merchantId));
        },
      },
    },
  });
}

function scopeArgs(
  model: string,
  operation: string,
  args: Args,
  merchantId: string,
): Args {
  if (model === 'Customer') {
    throw new Error(
      'En el panel, los clientes se leen a través de una membresía del comercio',
    );
  }
  if (model === 'Merchant') return scopeMerchant(operation, args, merchantId);
  if (!SCOPED_BY_MERCHANT_ID.has(model)) return args;

  const scoped = { ...args };
  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...args.where, merchantId };
  }
  if (CREATE_OPERATIONS.has(operation)) {
    if (operation === 'upsert') {
      scoped.create = withMerchant(args.create, merchantId);
    } else {
      scoped.data = Array.isArray(args.data)
        ? args.data.map((row: object) => withMerchant(row, merchantId))
        : withMerchant(args.data as object, merchantId);
    }
  }
  return scoped;
}

function scopeMerchant(operation: string, args: Args, merchantId: string) {
  if (!MERCHANT_OPERATIONS.has(operation)) {
    throw new Error(`El panel no puede hacer ${operation} sobre Merchant`);
  }
  return { ...args, where: { ...args.where, id: merchantId } };
}

function withMerchant(data: object | undefined, merchantId: string) {
  const current = (data as { merchantId?: string } | undefined)?.merchantId;
  if (current !== undefined && current !== merchantId) {
    throw new Error('No se puede crear un registro en otro comercio');
  }
  return { ...data, merchantId };
}
