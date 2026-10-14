# resto-api

Backend NestJS de FullSync Club. El contexto general del producto (reglas de negocio, modelo de datos, API, seguridad) está en `../CLAUDE.md`; acá va solo lo específico de este repo.

## Comandos

```bash
docker compose up -d                          # Postgres local (puerto 5434)
pnpm start:dev                                # API en http://localhost:3001
pnpm test                                     # unitarios (*.spec.ts, Vitest)
pnpm test:e2e                                 # E2E (test/*.e2e-spec.ts, Vitest)
pnpm lint                                     # oxlint
pnpm exec prisma migrate dev --name <nombre>  # crear y aplicar migración
pnpm exec prisma generate                     # regenerar el cliente
```

## Stack y convenciones del repo

- **Nest 12 en ESM** (`"type": "module"`): los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`).
- **Prisma 7.10**:
  - La configuración está en `prisma7.config.ts` (es el nombre por defecto en esta versión) y el schema en `prisma/schema.prisma`.
  - El cliente se genera en `src/generated/prisma` (está en `.gitignore`: correr `prisma generate` después de clonar).
  - En runtime se conecta con el driver adapter `@prisma/adapter-pg`.
  - Antes de usar una API de Prisma que no conozcas bien, consultá la documentación de la v7: cambió bastante respecto de la v5/v6.
- **pnpm** bloquea los scripts de instalación de las dependencias. Los permitidos están en `allowBuilds` de `pnpm-workspace.yaml`.
- Variables de entorno documentadas en `.env.example`.

## Base de datos local

Postgres 16 en docker (`docker-compose.yml`), en `localhost:5434`. Bases: `resto_club` (desarrollo) y `resto_club_test` (E2E).

| Rol | Variable | Uso |
|---|---|---|
| `resto_migrator` | `MIGRATE_DATABASE_URL` | Dueño de las tablas. Solo `prisma migrate` (ignora RLS) |
| `resto_app` | `DATABASE_URL` | Runtime de la API, sujeto a RLS |
| `resto_app_admin` | `DATABASE_ADMIN_URL` | `/admin/*` y lectura pública de piezas (`BYPASSRLS`) |

- Las migraciones **siempre** corren como `resto_migrator`: los permisos por defecto (`ALTER DEFAULT PRIVILEGES`) les dan acceso a `resto_app` y `resto_app_admin` a cada tabla nueva que crea ese rol.
- Los roles y las bases los crea `docker/postgres/init/01-roles.sh`, solo cuando el volumen está vacío. Para recrear todo desde cero: `docker compose down -v && docker compose up -d` (**borra los datos**).
