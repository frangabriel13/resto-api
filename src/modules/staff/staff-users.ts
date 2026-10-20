import { AppException } from '../../common/errors/app.exception.js';
import { generatePassword, hashPassword } from '../../common/passwords.js';
import type {
  StaffMembership,
  StaffUser,
} from '../../generated/prisma/client.js';

// Solo lo que usa: así sirve la transacción del admin y la del panel, que
// tienen tipos de cliente distintos.
type StaffUserDb = {
  staffUser: {
    findUnique(args: {
      where: { email: string };
      include: { memberships: { where: { merchantId: string } } };
    }): Promise<(StaffUser & { memberships: StaffMembership[] }) | null>;
    create(args: {
      data: { email: string; name: string; passwordHash: string };
    }): Promise<StaffUser>;
  };
};

export type FoundOrCreatedUser = {
  user: StaffUser;
  // Solo para una cuenta nueva: se muestra una única vez.
  temporaryPassword: string | null;
};

// Si el email ya es de alguien de staff (de otro comercio), se reutiliza su
// cuenta y conserva su contraseña. Lo usan el admin (dueños) y el panel
// (empleados).
export async function findOrCreateStaffUser(
  db: StaffUserDb,
  merchantId: string,
  { email, name }: { email: string; name: string },
): Promise<FoundOrCreatedUser> {
  const existing = await db.staffUser.findUnique({
    where: { email },
    include: { memberships: { where: { merchantId } } },
  });
  if (existing?.memberships.length) {
    throw new AppException('STAFF_ALREADY_IN_MERCHANT');
  }
  if (existing) return { user: existing, temporaryPassword: null };

  const temporaryPassword = generatePassword();
  const user = await db.staffUser.create({
    data: { email, name, passwordHash: await hashPassword(temporaryPassword) },
  });
  return { user, temporaryPassword };
}
