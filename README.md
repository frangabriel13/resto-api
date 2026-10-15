# resto-api

API de Clubsy (NestJS + Prisma + PostgreSQL).

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm exec prisma generate
pnpm exec prisma migrate dev
pnpm exec prisma db seed   # opcional: comercio de demo
pnpm start:dev             # http://localhost:3001 (documentación en /docs)
```

Comandos, convenciones y contexto del producto: [`CLAUDE.md`](CLAUDE.md) y [`../CLAUDE.md`](../CLAUDE.md).
