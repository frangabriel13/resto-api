import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

// Rol admin (BYPASSRLS): los scripts cruzan comercios.
export function createAdminClient() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error('Falta DATABASE_ADMIN_URL (ver .env.example).');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
