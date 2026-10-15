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
```

## Stack y convenciones del repo

- **Nest 12 en ESM** (`"type": "module"`): los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`).
- **Prisma 7.10**:
  - La configuración está en `prisma7.config.ts` (es el nombre por defecto en esta versión) y el schema en `prisma/schema.prisma`.
  - El cliente se genera en `src/generated/prisma` (está en `.gitignore`: correr `prisma generate` después de clonar).
  - En runtime se conecta con el driver adapter `@prisma/adapter-pg`.
  - Dos clientes globales (`src/prisma/`): `PrismaService` (rol `resto_app`, sujeto a RLS) para toda la API, y `PrismaAdminService` (rol `resto_app_admin`, `BYPASSRLS`) **solo** para `/admin/*` y la lectura pública de piezas. Los dos hacen un `SELECT 1` al iniciar: sin base, la API no levanta (y los E2E tampoco corren).
  - Antes de usar una API de Prisma que no conozcas bien, consultá la documentación de la v7: cambió bastante respecto de la v5/v6.
- **Validación:** schemas de zod en los decoradores (`@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema })`), con el `StandardSchemaValidationPipe` nativo de Nest 12 registrado global (`src/common/validation.ts`). No usar `nestjs-zod` ni `class-validator`. Si falla la validación, la respuesta es `VALIDATION_ERROR` con `details.issues`.
- **OpenAPI:** `@nestjs/swagger` lee los schemas de zod. Darles nombre con `.meta({ id: 'CreateStampBody' })` para que salgan como componentes, y documentar las respuestas con `@ApiResponse({ status, standardSchema })`. En los schemas de respuesta las fechas van como `z.iso.datetime()` (`z.date()` no se puede representar en JSON Schema). UI en `/docs` y JSON en `/docs/json`, solo fuera de producción.
- **Errores:** lanzar `AppException(code, message?, details?)` (`src/common/errors/`). El status sale del catálogo `errorCatalog` en `error-codes.ts`; un código nuevo se agrega ahí, en la tarea que lo empieza a usar. El filtro global convierte todo al formato `ApiError` y los errores inesperados en `INTERNAL_ERROR` sin detalles (quedan logueados).
- **pnpm** bloquea los scripts de instalación de las dependencias. Los permitidos están en `allowBuilds` de `pnpm-workspace.yaml`.
- Variables de entorno documentadas en `.env.example` y validadas al arrancar con zod (`src/config/env.ts`): si falta o está mal alguna, la API no levanta. Para leerlas, `ConfigService<Env, true>` con `{ infer: true }`. Al agregar una variable, sumarla al schema y al `.env.example`.

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
