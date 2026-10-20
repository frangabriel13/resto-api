import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../../common/prisma-errors.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { findOrCreateStaffUser } from '../../staff/staff-users.js';
import type { CreateOwnerBody, CreatedOwner } from './admin-owners.schemas.js';

@Injectable()
export class AdminOwnersService {
  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async create(
    adminId: string,
    merchantId: string,
    body: CreateOwnerBody,
  ): Promise<CreatedOwner> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertMerchantExists(tx, merchantId);
        const { user, temporaryPassword } = await findOrCreateStaffUser(
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
