import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { generatePassword, hashPassword } from '../../../common/passwords.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { CreateOwnerBody, CreatedOwner } from './admin-owners.schemas.js';

@Injectable()
export class AdminOwnersService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  // Si el email ya es de un usuario de staff (dueño de otro comercio), se le
  // suma este comercio y conserva su contraseña.
  async create(
    adminId: string,
    merchantId: string,
    body: CreateOwnerBody,
  ): Promise<CreatedOwner> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertMerchantExists(tx, merchantId);
        const { user, temporaryPassword } = await findOrCreateUser(
          tx,
          merchantId,
          body,
        );
        await tx.staffMembership.create({
          data: { staffUserId: user.id, merchantId, role: 'OWNER' },
        });
        const newUser = temporaryPassword !== null;
        await this.audit.recordAdmin(tx, adminId, merchantId, {
          action: 'staff.created',
          entityId: user.id,
          payload: { role: 'OWNER', email: user.email, newUser },
        });
        return {
          staffUserId: user.id,
          email: user.email,
          name: user.name,
          newUser,
          temporaryPassword,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('CONFLICT');
      throw error;
    }
  }
}

async function assertMerchantExists(
  tx: Prisma.TransactionClient,
  merchantId: string,
) {
  const merchant = await tx.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new AppException('NOT_FOUND');
}

async function findOrCreateUser(
  tx: Prisma.TransactionClient,
  merchantId: string,
  { email, name }: CreateOwnerBody,
) {
  const existing = await tx.staffUser.findUnique({
    where: { email },
    include: { memberships: { where: { merchantId } } },
  });
  if (existing?.memberships.length) {
    throw new AppException('STAFF_ALREADY_IN_MERCHANT');
  }
  if (existing) return { user: existing, temporaryPassword: null };

  const temporaryPassword = generatePassword();
  const user = await tx.staffUser.create({
    data: { email, name, passwordHash: await hashPassword(temporaryPassword) },
  });
  return { user, temporaryPassword };
}
