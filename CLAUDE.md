# resto-api

Backend NestJS de Clubsy. El contexto general del producto (reglas de negocio, modelo de datos, API, seguridad) está en `../CLAUDE.md`; acá va solo lo específico de este repo.

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
pnpm sentry:check                             # mandar un evento de prueba a Sentry (con SENTRY_DSN)
docker build --target runtime -t resto-api .   # imagen de producción (ver "Producción")
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
- **Validación:** schemas de zod en los decoradores (`@Body({ schema })`, `@Query('nombre', { schema })`, `@Param('id', { schema })`), con el `StandardSchemaValidationPipe` nativo de Nest 12 registrado global (`src/common/validation.ts`). No usar `nestjs-zod` ni `class-validator`. Si falla la validación, la respuesta es `VALIDATION_ERROR` con `details.issues`.
- **OpenAPI:** `@nestjs/swagger` lee los schemas de zod. Darles nombre con `.meta({ id: 'CreateStampBody' })` para que salgan como componentes, y documentar las respuestas con `@ApiResponse({ status, standardSchema })`. En los schemas de respuesta las fechas van como `z.iso.datetime()` (`z.date()` no se puede representar en JSON Schema). UI en `/docs` y JSON en `/docs/json`, solo fuera de producción. Los parámetros de query van de a uno con nombre (`@Query('from', { schema })`): un schema de objeto en `@Query({ schema })` valida pero no sale en el OpenAPI. Si son opcionales, agregar `@ApiQuery({ name, required: false })`, porque Swagger no ve el `.optional()`.
- **Sentry** (`@sentry/nestjs` 11, la primera línea compatible con Nest 12): se inicializa en `src/instrument.ts`, que en producción se carga antes que Nest (`start:prod` usa `node --import ./dist/instrument.js`, porque en ESM tiene que ir primero). Sin `SENTRY_DSN` no hace nada. Las opciones y la limpieza de eventos están en `src/config/sentry.ts`: en la v11 el SDK recolecta todo por defecto (cookies, cabeceras, bodies, variables locales), así que se apaga explícitamente con `dataCollection`. Los errores se reportan desde `AllExceptionsFilter` con `ErrorReporter`, solo los 5xx; en los E2E se reemplaza para ver qué se reportó. La release es `SOURCE_COMMIT`, el commit que despliega Coolify.
- **Errores:** lanzar `AppException(code, message?, details?)` (`src/common/errors/`). El status sale del catálogo `errorCatalog` en `error-codes.ts`; un código nuevo se agrega ahí, en la tarea que lo empieza a usar. El filtro global convierte todo al formato `ApiError` y los errores inesperados en `INTERNAL_ERROR` sin detalles (quedan logueados).
- **Panel** (`src/modules/auth/panel/`, `src/common/tenant/`): los controllers del panel llevan `@Panel()` (sesión de staff, contraseña ya cambiada, comercio seleccionado y transacción por request) y `@Roles('OWNER')` donde corresponda. Los services usan `TenantContext.db` (nunca `PrismaService`) y `TenantContext.scope` (`merchantId`, `role`, `staffUserId`, `merchantStatus`).
  - El filtro por comercio es automático en lecturas, updates y deletes. En los `create` igual hay que pasar `merchantId: scope.merchantId` (lo piden los tipos de Prisma); la extensión rechaza otro valor.
  - La extensión **reemplaza** cualquier filtro sobre `merchantId` por el del contexto: `merchantId: { not: … }` no funciona dentro del panel. Para mirar otros comercios (como el chequeo de cuenta compartida de los empleados), consultar aparte con `runWithSetting`.
  - No pasan por el filtro: el SQL a mano (`$queryRaw`) y las escrituras anidadas (las cubren las FKs compuestas). Los clientes se leen a través de `membership` (`include: { customer: true }`); `db.customer` falla.
- **Antes del contexto:** los guards, el login de staff y la verificación del OTP leen con `runWithSetting(prisma, 'app.staff_user_id' | 'app.customer_id' | 'app.customer_phone', valor, tx => …)` (`src/common/request-scope/scoped-transaction.ts`): sin una variable de contexto, RLS no les devuelve nada.
- **Cliente** (`src/common/customer-scope/`): los controllers de `/me/*` llevan `@CustomerRoute()` y los services usan `CustomerContext.db` y `CustomerContext.customerId`. Las piezas comunes con el panel (AsyncLocalStorage, `set_config` en la transacción, grupos de operaciones de Prisma) están en `src/common/request-scope/`.
- **Vista de la membresía en el panel:** `toPanelMembership` (`src/modules/memberships/panel-membership.ts`) arma cliente (teléfono según el rol) y saldo; la usan el escaneo, el sello, el canje, la búsqueda y la ficha. Para buscar, bloquear (`FOR UPDATE`) y devolver esa vista, sellos y canjes usan `PanelMembershipsService` (en su propio módulo, para no armar una dependencia circular con `MembershipsModule`). El token del QR se valida con `StampTokenService.readOrThrow`. Las reglas de anulación están en funciones puras que usan el endpoint y el `canVoid` de la ficha: `voidDenial` (`src/modules/stamps/void-rules.ts`) para sellos y `redemptionVoidDenial` (`src/modules/redemptions/redemption-void-rules.ts`) para canjes.
- **Campos del comercio:** las validaciones de colores, links y cooldown están en `src/modules/merchants/merchant-fields.ts` (las usan el admin y la configuración del panel). Si el panel puede editar algo según el estado del comercio, lo decide `isPanelEditable` (`merchant-status.ts`).
- **Días en hora AR:** todo lo que filtra o agrupa por día (actividad, estadísticas) usa `src/common/ar-time.ts` (`resolveArRange`, `arDay`, `arDaysOf`); el parámetro de query es `arDayParamSchema` (`src/common/schemas.ts`).
- **Admin:** los controllers de `/admin/*` llevan `@AdminOnly()` y usan `PrismaAdminService`. Las escrituras van en `$transaction` junto con `AuditService.recordAdmin(tx, ...)`.
- **Secretos:** `SECRET_KEY` es la única clave del servidor. Cada uso deriva su propia subclave con `deriveKey(secret, 'uso')` (`src/common/crypto.ts`); nunca usar la clave directa.
- **Mails:** el envío va detrás de `EmailSender` (token `EMAIL_SENDER`, `src/modules/email/`); la variable `EMAIL_SENDER` elige `console` (loguea el mail) o `resend` (`ResendEmailSender`, con `RESEND_API_KEY` y `EMAIL_FROM`). Sin dominio verificado, Resend solo manda al email de su cuenta desde `onboarding@resend.dev`. Los links apuntan a `APP_URL`. El mail de recuperación se manda sin esperarlo; si falla, se loguea y se reporta con `ErrorReporter`. En los E2E se reemplaza con `FakeEmailSender` (`test/helpers/`, con `failing` para simular la falla).
- **Proveedores externos** (WhatsApp, Resend): se llaman con `postJson` (`src/common/post-json.ts`, timeout de 10 s) y sus errores llevan solo el servicio, el estado HTTP y el código o tipo de error del proveedor, nunca el mensaje (puede traer el teléfono o el email). `ErrorReporter` está en un módulo global (`ErrorsModule`) para reportar desde cualquier service.
- **Tokens al azar** (sesiones, reset de contraseña): `generateToken` y `hashToken` (`src/common/tokens.ts`); en la base se guarda solo el hash.
- **OTP:** el envío va detrás de `OtpSender` (token `OTP_SENDER`); la variable `OTP_SENDER` elige `console` o `whatsapp` (`otp-sender.provider.ts`). `WhatsAppOtpSender` llama a la Cloud API de Meta (`v25.0`) con la plantilla `WHATSAPP_TEMPLATE_NAME`, y le saca el 9 al celular (`+54911…` → `5411…`): Meta lo resuelve igual a la cuenta y la lista de destinatarios del número de prueba lo exige así. Si Meta falla o no responde en 10 s, lanza `OTP_DELIVERY_FAILED` con el código de error de Meta como `cause` (llega a Sentry; nunca el teléfono, el código ni el token). Como el envío corre dentro de la transacción del pedido, un envío fallido no deja el código guardado. En los E2E se reemplaza con `.overrideProvider(OTP_SENDER).useValue(fake)` (`FakeOtpSender`, con `failing` para simular la falla). Teléfonos: `normalizeArMobile` y `maskPhone` (`src/modules/customers/phone.ts`).
- **Auditoría:** las acciones del staff de la regla 11 se registran con `AuditService.record({ action, entityId, payload })` dentro del request del panel (misma transacción: si la acción falla, no queda registro). Las acciones válidas están en `AUDIT_ACTIONS`; una nueva se agrega ahí.
- **Sesiones** (`src/modules/auth/sessions/`): las rutas de staff fuera del panel (como `/auth/staff/*`) van con `@UseGuards(StaffGuard)` (valida la sesión y bloquea con `PASSWORD_CHANGE_REQUIRED`; `@AllowPendingPasswordChange()` lo exceptúa). Las rutas del cliente llevan `@CustomerOnly()` (sesión válida y cuenta no borrada); las de admin, `@AdminOnly()`. La sesión se lee con `@Auth()`. Los logins y logouts llaman a `SessionService.start` / `end` con `@Res({ passthrough: true })`. Sin sesión válida, el guard responde `UNAUTHENTICATED`.
- **Límite de intentos:** `ThrottlerModule` está registrado sin aplicarse globalmente; cada ruta sensible lleva `@UseGuards(ThrottlerGuard)` y `@Throttle(...)`. Cuenta en memoria (una sola instancia). La IP del cliente sale de `X-Forwarded-For`: `trustInternalProxies` (`src/common/trust-proxy.ts`, lo llama `main.ts`) confía solo en direcciones locales y privadas, que en producción son el proxy de Coolify y el front en la red de docker. Express toma la primera IP de derecha a izquierda que no es de confianza, así que una IP inventada por el cliente no cambia nada (`test/client-ip.e2e-spec.ts`). Si se pone Cloudflare (u otro proxy público) delante, hay que revisarlo: la IP que llegaría sería la suya. En los E2E que llegan al límite, crear una app por test.
- Los mensajes de validación de zod están en español (`z.config(z.locales.es())` en `src/common/validation.ts`).
- **Comentarios:** solo el porqué que el código no dice (una restricción no obvia, un workaround). Nada que repita nombres o narre lo que hace la línea siguiente. Funciones cortas, de una responsabilidad.
- **pnpm** bloquea los scripts de instalación de las dependencias. Los permitidos están en `allowBuilds` de `pnpm-workspace.yaml`.
- Variables de entorno documentadas en `.env.example` y validadas al arrancar con zod (`src/config/env.ts`): si falta o está mal alguna, la API no levanta. Para leerlas, `ConfigService<Env, true>` con `{ infer: true }`. Al agregar una variable, sumarla al schema, al `.env.example` y al `docker-compose.prod.yml`. Una variable vacía cuenta como no definida (el compose pasa `${VAR:-}`).

## Producción

- **Imagen** (`Dockerfile`, Node 24.14.1 y el pnpm de `packageManager`): la etapa `runtime` tiene solo las dependencias de producción y `dist`, corre como el usuario `node` y arranca con Sentry primero. Su `HEALTHCHECK` llama a `GET /health` (API y base). `/docs` no existe en producción.
- **Migraciones aparte:** la etapa `migrate` tiene todo el repo y corre `prisma migrate deploy` con `MIGRATE_DATABASE_URL`. Es la única que conoce la URL de `resto_migrator` (dueño de las tablas, podría apagar RLS); la API solo tiene las de `resto_app` y `resto_app_admin`. La misma imagen corre los scripts: `node_modules/.bin/tsx scripts/create-admin.ts --email … --name …` con `DATABASE_ADMIN_URL` (los binarios van directo porque pnpm quedó instalado para root).
- **`docker-compose.prod.yml`** (lo despliega Coolify): `migrate` corre primero y la API arranca solo si terminó bien. Cada servicio recibe únicamente sus variables; las obligatorias van con `${VAR:?}`. La API no publica puertos: le llega el tráfico por la red interna.
- **Probarlo en local:** crear una base vacía en el Postgres de docker con los permisos de `docker/postgres/init/01-roles.sh`, y levantar el compose con un archivo de variables y un override que lo conecte a la red `resto-club_default` (las URLs usan el host `postgres`).

## Scripts y datos de demo

- `scripts/` tiene scripts de consola que se corren con `tsx`. Se conectan como `resto_app_admin` (`DATABASE_ADMIN_URL`), porque son tareas administrativas que cruzan comercios. La lógica está en `scripts/lib/` (la demo, en `scripts/lib/demo/`: datos en `demo-fixtures.ts`, creación en `seed-demo.ts`) y la cubre `test/scripts.e2e-spec.ts`.
- **Seed de demo** (`prisma db seed`): borra y vuelve a crear el comercio `cafe-demo`, que está `ACTIVE`, con regla de 8 sellos y pieza `/p/cafe-demo`. Tiene un dueño (`dueno@demo.fullsync.test`) y un empleado (`empleado@demo.fullsync.test`), con contraseña `DEMO_STAFF_PASSWORD` (por defecto `demo1234`), y 6 clientes `[DEMO]` en estados distintos: casi completa, para canjear, ya canjeó, sello anulado, sello manual y sin sellos.
- Solo toca lo de la demo: el comercio por slug, el staff por el dominio `@demo.fullsync.test` y los clientes por el prefijo de teléfono `+549110000`. Ese rango no existe, así que nunca se le manda un mensaje a una persona real (y tampoco se va a poder entrar con OTP como esos clientes). Un cliente `[DEMO]` que también está en otro comercio no se borra: el seed lo reutiliza (y le restituye el nombre).
- **PlatformAdmin:** `pnpm admin:create` genera una contraseña aleatoria y la muestra una sola vez. Si el email ya existe, le genera una nueva y le cierra las sesiones: es la forma de recuperar el acceso de un admin.

## Base de datos local

Postgres 16 en docker (`docker-compose.yml`), en `localhost:5434`. Bases: `resto_club` (desarrollo) y `resto_club_test` (E2E).

| Rol | Variable | Uso |
|---|---|---|
| `resto_migrator` | `MIGRATE_DATABASE_URL` | Dueño de las tablas. Solo `prisma migrate` (con `FORCE`, RLS también lo alcanza) |
| `resto_app` | `DATABASE_URL` | Runtime de la API, sujeto a RLS |
| `resto_app_admin` | `DATABASE_ADMIN_URL` | `/admin/*` y lectura pública de piezas (`BYPASSRLS`) |

- Las migraciones **siempre** corren como `resto_migrator`: los permisos por defecto (`ALTER DEFAULT PRIVILEGES`) les dan acceso a `resto_app` y `resto_app_admin` a cada tabla nueva que crea ese rol.
- **RLS** (migración `rls`): las políticas leen las variables de contexto con funciones (`app_merchant_id()`, etc.). Como las tablas tienen `FORCE ROW LEVEL SECURITY`, una migración que modifique datos del dominio no ve filas como `resto_migrator`: tiene que fijar el contexto o hacerse con `resto_app_admin`. Una tabla nueva va con RLS y sus políticas en su migración, o en la lista de exentas de `test/rls.e2e-spec.ts` (si no, ese test falla).
- Los roles y las bases los crea `docker/postgres/init/01-roles.sh`, solo cuando el volumen está vacío. Para recrear todo desde cero: `docker compose down -v && docker compose up -d` (**borra los datos**).

## Tests E2E

- Corren contra `resto_club_test` con las variables de `.env.test` (versionado: solo credenciales locales de docker). Las variables del entorno tienen prioridad, pero si alguna URL no apunta a una base terminada en `_test`, los E2E no arrancan.
- Antes de correr se aplican las migraciones pendientes con `prisma migrate deploy` (`test/setup/global-setup.ts`). No usar `migrate reset` en la base de test: borra el schema `public` y con él los permisos por defecto de `resto_app` y `resto_app_admin`.
- **Cada test arranca con la base vacía** (`test/setup/reset-between-tests.ts` hace `TRUNCATE` de todas las tablas antes de cada test). Los datos que necesita un test se crean en su `beforeEach` o en el propio test, nunca en `beforeAll`.
- Los archivos corren de a uno (`fileParallelism: false`) porque comparten la base.
- **Fixtures:** los datos de los tests se crean y se leen con `PrismaAdminService` (con `PrismaService` y sin contexto, RLS no deja ver ni escribir nada). `PrismaService` queda para probar el rol de runtime. `test/helpers/club.ts` crea un comercio activo con su staff (`createClub`), suma clientes por el flujo real de OTP (`joinClub`) y pide el token del QR (`stampTokenFor`). No anidar un `await` de otro request dentro de un request de supertest que ya se está armando: pedir los datos antes.
- **Aislamiento:** `test/helpers/panel-isolation.ts` y `customer-isolation.ts` tienen la matriz de endpoints (staff de A contra B; cliente contra otro cliente) y comparan los datos del otro antes y después de cada test. Corren dos veces: `*-isolation.e2e-spec.ts` (normal) y `*-isolation-rls-only.e2e-spec.ts`, que reemplaza la extensión con `vi.mock` para probar que RLS solo alcanza. Un endpoint nuevo del panel o de `/me/*` se suma a la matriz.
- **Bloqueos (`FOR UPDATE`):** se prueban de forma determinista con `whileRowLocked` (`test/helpers/row-lock.ts`): otra conexión (admin, por RLS) bloquea la fila, el request queda esperando y, mientras, el test inserta lo que el código tiene que ver al destrabarse. Sin el bloqueo en el código, el test falla siempre. Los tests de "dos requests a la vez" quedan como prueba de humo: no detectan la falta del bloqueo de forma confiable.
