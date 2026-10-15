export const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

export const WHERE_OPERATIONS = new Set([
  ...READ_OPERATIONS,
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

export const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
]);

export type QueryArgs = { where?: object; data?: unknown; create?: object };

export function addToWhere(args: QueryArgs, filter: object): QueryArgs {
  return { ...args, where: { ...args.where, ...filter } };
}

// Completa `field` en los datos a crear y rechaza un valor distinto.
export function fillOnCreate(
  operation: string,
  args: QueryArgs,
  field: string,
  value: string,
): QueryArgs {
  const fill = (data: object | undefined) => {
    const current = (data as Record<string, unknown> | undefined)?.[field];
    if (current !== undefined && current !== value) {
      throw new Error(`No se puede crear un registro con otro ${field}`);
    }
    return { ...data, [field]: value };
  };
  if (operation === 'upsert') return { ...args, create: fill(args.create) };
  const data = Array.isArray(args.data)
    ? args.data.map((row: object) => fill(row))
    : fill(args.data as object | undefined);
  return { ...args, data };
}
