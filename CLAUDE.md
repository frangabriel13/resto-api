# resto-api

Backend NestJS de FullSync Club. El contexto general del producto (reglas de negocio, modelo de datos, API, seguridad) está en `../CLAUDE.md`; acá va solo lo específico de este repo.

## Comandos

```bash
docker compose up -d                          # Postgres local (puerto 5434)
pnpm start:dev                                # API en http://localhost:3001
pnpm test                                     # unitarios (*.spec.ts, Vitest)
pnpm test:e2e                                 # E2E (test/*.e2e-spec.ts, Vitest)
pnpm lint                                     # oxlint
pnpm typecheck                                # tsc sin emitir (src, test y configs)
pnpm exec prisma migrate dev --name <nombre>  # crear y aplicar migración
pnpm exec prisma generate                     # regenerar el cliente
pnpm exec prisma db seed                      # recrear el comercio de demo (ver abajo)
pnpm admin:create --email <email> --name <n>  # crear un PlatformAdmin (o darle contraseña nueva)
```

## Stack y convenciones del repo

- **Nest 12 en ESM** (`"type": "module"`): los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`).
- **Prisma 7.10**:
  - La configuración está en `prisma7.config.ts` (es el nombre por defecto en esta versión) y el schema en `prisma/schema.prisma`.
  - El cliente se genera en `src/generated/prisma` (está en `.gitignore`: correr `prisma generate` después de clonar).
  - En runtime se conecta con el driver adapter `@prisma/adapter-pg`.
  - Dos clientes globales (`src/prisma/`): `PrismaService` (rol `resto_app`, sujeto a RLS) para toda la API, y `PrismaAdminService` (rol `resto_app_admin`, `BYPASSRLS`) **solo** para `/admin/*` y la lectura pública de piezas. Los dos hacen un `SELECT 1` al iniciar: sin base, la API no levanta (y los E2E tampoco corren).
  - **Schema:** modelos en camelCase mapeados a snake_case en la base (`@map`/`@@map`), IDs `uuid(7)`, fechas `@db.Timestamptz(3)`. Usa la preview `partialIndexes` (índices únicos con `where`).
  - Las relaciones entre tablas de un comercio son FKs compuestas `(id, merchant_id)`. Al crear registros, pasar los IDs como escalares (`{ merchantId, membershipId, ... }`) en vez de `connect`.
  - **Los `CHECK` se agregan a mano** al final del `migration.sql` (crear con `migrate dev --create-only`, editar y después aplicar con `migrate dev`). Prisma no los genera ni los ve en el schema, pero tampoco los toma como diferencia. Los actuales están en la migración `init`.
  - Antes de usar una API de Prisma que no conozcas bien, consultá la documentación de la v7: cambió bastante respecto de la v5/v6.
- **Validación:** schemas de zod en los decoradores (`@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema })`), con el `StandardSchemaValidationPipe` nativo de Nest 12 registrado global (`src/common/validation.ts`). No usar `nestjs-zod` ni `class-validator`. Si falla la validación, la respuesta es `VALIDATION_ERROR` con `details.issues`.
- **OpenAPI:** `@nestjs/swagger` lee los schemas de zod. Darles nombre con `.meta({ id: 'CreateStampBody' })` para que salgan como componentes, y documentar las respuestas con `@ApiResponse({ status, standardSchema })`. En los schemas de respuesta las fechas van como `z.iso.datetime()` (`z.date()` no se puede representar en JSON Schema). UI en `/docs` y JSON en `/docs/json`, solo fuera de producción.
- **Errores:** lanzar `AppException(code, message?, details?)` (`src/common/errors/`). El status sale del catálogo `errorCatalog` en `error-codes.ts`; un código nuevo se agrega ahí, en la tarea que lo empieza a usar. El filtro global convierte todo al formato `ApiError` y los errores inesperados en `INTERNAL_ERROR` sin detalles (quedan logueados).
- **Panel** (`src/modules/auth/panel/`, `src/common/tenant/`): los controllers del panel llevan `@Panel()` (sesión de staff, contraseña ya cambiada, comercio seleccionado y transacción por request) y `@Roles('OWNER')` donde corresponda. Los services usan `TenantContext.db` (nunca `PrismaService`) y `TenantContext.scope` (`merchantId`, `role`, `staffUserId`, `merchantStatus`).
  - El filtro por comercio es automático en lecturas, updates y deletes. En los `create` igual hay que pasar `merchantId: scope.merchantId` (lo piden los tipos de Prisma); la extensión rechaza otro valor.
  - No pasan por el filtro: el SQL a mano (`$queryRaw`) y las escrituras anidadas (las cubren las FKs compuestas). Los clientes se leen a través de `membership` (`include: { customer: true }`); `db.customer` falla.
- **Admin:** los controllers de `/admin/*` llevan `@AdminOnly()` y usan `PrismaAdminService`. Las escrituras van en `$transaction` junto con `AuditService.recordAdmin(tx, ...)`.
- **Auditoría:** las acciones del staff de la regla 11 se registran con `AuditService.record({ action, entityId, payload })` dentro del request del panel (misma transacción: si la acción falla, no queda registro). Las acciones válidas están en `AUDIT_ACTIONS`; una nueva se agrega ahí.
- **Sesiones** (`src/modules/auth/sessions/`): las rutas de staff fuera del panel (como `/auth/staff/*`) van con `@UseGuards(StaffGuard)` (valida la sesión y bloquea con `PASSWORD_CHANGE_REQUIRED`; `@AllowPendingPasswordChange()` lo exceptúa). Para cliente y admin, `@UseGuards(SessionGuard('customer' | 'admin'))`. La sesión se lee con `@Auth()`. Los logins y logouts llaman a `SessionService.start` / `end` con `@Res({ passthrough: true })`. Sin sesión válida, el guard responde `UNAUTHENTICATED`.
- **Límite de intentos:** `ThrottlerModule` está registrado sin aplicarse globalmente; cada ruta sensible lleva `@UseGuards(ThrottlerGuard)` y `@Throttle(...)`. Cuenta en memoria (una sola instancia). La IP del cliente sale de `X-Forwarded-For` porque `main.ts` confía en proxies de red privada (`trust proxy`); revisarlo al definir el hosting. En los E2E que llegan al límite, crear una app por test.
- Los mensajes de validación de zod están en español (`z.config(z.locales.es())` en `src/common/validation.ts`).
- **Comentarios:** solo el porqué que el código no dice (una restricción no obvia, un workaround). Nada que repita nombres o narre lo que hace la línea siguiente. Funciones cortas, de una responsabilidad.
- **pnpm** bloquea los scripts de instalación de las dependencias. Los permitidos están en `allowBuilds` de `pnpm-workspace.yaml`.
- Variables de entorno documentadas en `.env.example` y validadas al arrancar con zod (`src/config/env.ts`): si falta o está mal alguna, la API no levanta. Para leerlas, `ConfigService<Env, true>` con `{ infer: true }`. Al agregar una variable, sumarla al schema y al `.env.example`.

## Scripts y datos de demo

- `scripts/` tiene scripts de consola que se corren con `tsx`. Se conectan como `resto_app_admin` (`DATABASE_ADMIN_URL`), porque son tareas administrativas que cruzan comercios. La lógica está en `scripts/lib/` (la demo, en `scripts/lib/demo/`: datos en `demo-fixtures.ts`, creación en `seed-demo.ts`) y la cubre `test/scripts.e2e-spec.ts`.
- **Seed de demo** (`prisma db seed`): borra y vuelve a crear el comercio `cafe-demo`, que está `ACTIVE`, con regla de 8 sellos y pieza `/p/cafe-demo`. Tiene un dueño (`dueno@demo.fullsync.test`) y un empleado (`empleado@demo.fullsync.test`), con contraseña `DEMO_STAFF_PASSWORD` (por defecto `demo1234`), y 6 clientes `[DEMO]` en estados distintos: casi completa, para canjear, ya canjeó, sello anulado, sello manual y sin sellos.
- Solo toca lo de la demo: el comercio por slug, el staff por el dominio `@demo.fullsync.test` y los clientes por el prefijo de teléfono `+549110000`. Ese rango no existe, así que nunca se le manda un mensaje a una persona real (y tampoco se va a poder entrar con OTP como esos clientes).
- **PlatformAdmin:** `pnpm admin:create` genera una contraseña aleatoria y la muestra una sola vez. Si el email ya existe, le genera una nueva y le cierra las sesiones: es la forma de recuperar el acceso de un admin.

## Base de datos local

Postgres 16 en docker (`docker-compose.yml`), en `localhost:5434`. Bases: `resto_club` (desarrollo) y `resto_club_test` (E2E).

| Rol | Variable | Uso |
|---|---|---|
| `resto_migrator` | `MIGRATE_DATABASE_URL` | Dueño de las tablas. Solo `prisma migrate` (ignora RLS) |
| `resto_app` | `DATABASE_URL` | Runtime de la API, sujeto a RLS |
| `resto_app_admin` | `DATABASE_ADMIN_URL` | `/admin/*` y lectura pública de piezas (`BYPASSRLS`) |

- Las migraciones **siempre** corren como `resto_migrator`: los permisos por defecto (`ALTER DEFAULT PRIVILEGES`) les dan acceso a `resto_app` y `resto_app_admin` a cada tabla nueva que crea ese rol.
- Los roles y las bases los crea `docker/postgres/init/01-roles.sh`, solo cuando el volumen está vacío. Para recrear todo desde cero: `docker compose down -v && docker compose up -d` (**borra los datos**).

## Tests E2E

- Corren contra `resto_club_test` con las variables de `.env.test` (versionado: solo credenciales locales de docker). Las variables del entorno tienen prioridad, pero si alguna URL no apunta a una base terminada en `_test`, los E2E no arrancan.
- Antes de correr se aplican las migraciones pendientes con `prisma migrate deploy` (`test/setup/global-setup.ts`). No usar `migrate reset` en la base de test: borra el schema `public` y con él los permisos por defecto de `resto_app` y `resto_app_admin`.
- **Cada test arranca con la base vacía** (`test/setup/reset-between-tests.ts` hace `TRUNCATE` de todas las tablas antes de cada test). Los datos que necesita un test se crean en su `beforeEach` o en el propio test, nunca en `beforeAll`.
- Los archivos corren de a uno (`fileParallelism: false`) porque comparten la base.
