import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { generatePassword, hashPassword } from '../../src/common/passwords.js';

const emailSchema = z.email().transform((email) => email.trim().toLowerCase());

export type PlatformAdminResult = {
  email: string;
  password: string;
  created: boolean;
};

// Si ya existe, le da una contraseña nueva y le cierra las sesiones: los
// admins no tienen recuperación por email.
export async function createOrResetPlatformAdmin(
  prisma: PrismaClient,
  input: { email: string; name?: string },
): Promise<PlatformAdminResult> {
  const email = emailSchema.parse(input.email.trim());
  const password = generatePassword(20);
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.platformAdmin.findUnique({ where: { email } });
    if (existing) {
      await tx.platformAdmin.update({
        where: { id: existing.id },
        data: { passwordHash, ...(input.name && { name: input.name }) },
      });
      await tx.platformAdminSession.updateMany({
        where: { platformAdminId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { email, password, created: false };
    }
    if (!input.name) {
      throw new Error('Para crear un admin nuevo hace falta --name.');
    }
    await tx.platformAdmin.create({
      data: { email, name: input.name, passwordHash },
    });
    return { email, password, created: true };
  });
}
