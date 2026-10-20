import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { generatePassword, hashPassword } from '../../common/passwords.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';
import { runWithSetting } from '../../common/request-scope/scoped-transaction.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from '../auth/sessions/session.service.js';
import { staffActionDenial, type StaffAction } from './staff-rules.js';
import { findOrCreateStaffUser } from './staff-users.js';
import type {
  CreatedStaff,
  CreateStaffBody,
  PasswordReset,
  StaffMember,
} from './staff.schemas.js';

const withUser = { include: { staffUser: true } } as const;

type MembershipWithUser = Prisma.StaffMembershipGetPayload<typeof withUser>;

@Injectable()
export class StaffService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<StaffMember[]> {
    const memberships = await this.tenant.db.staffMembership.findMany({
      ...withUser,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return memberships.map(toStaffMember);
  }

  async create(body: CreateStaffBody): Promise<CreatedStaff> {
    this.assertAllowed('create', null);
    const { db } = this.tenant;
    const { merchantId } = this.tenant.scope;
    try {
      const { user, temporaryPassword } = await findOrCreateStaffUser(
        db,
        merchantId,
        body,
      );
      const membership = await db.staffMembership.create({
        data: { staffUserId: user.id, merchantId, role: 'EMPLOYEE' },
        ...withUser,
      });
      await this.audit.record({
        action: 'staff.created',
        entityId: user.id,
        payload: {
          role: 'EMPLOYEE',
          email: user.email,
          newUser: temporaryPassword !== null,
        },
      });
      return { staff: toStaffMember(membership), temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('CONFLICT');
      throw error;
    }
  }

  // Sin tocar sus sesiones: el TenantGuard le corta el acceso a este comercio
  // y puede seguir trabajando en otros.
  async setActive(staffUserId: string, active: boolean): Promise<StaffMember> {
    const membership = await this.find(staffUserId);
    this.assertAllowed(active ? 'reactivate' : 'deactivate', membership);
    if (membership.active === active) return toStaffMember(membership);

    const updated = await this.tenant.db.staffMembership.update({
      where: { id: membership.id },
      data: { active },
      ...withUser,
    });
    await this.audit.record({
      action: active ? 'staff.reactivated' : 'staff.deactivated',
      entityId: staffUserId,
    });
    return toStaffMember(updated);
  }

  async resetPassword(staffUserId: string): Promise<PasswordReset> {
    const membership = await this.find(staffUserId);
    this.assertAllowed('reset_password', membership);
    // Con su contraseña, el dueño entraría también a los otros comercios.
    if (await this.worksElsewhere(staffUserId)) {
      throw new AppException('STAFF_ACCOUNT_SHARED');
    }

    const temporaryPassword = generatePassword();
    await this.tenant.db.staffUser.update({
      where: { id: staffUserId },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });
    await this.sessions.endAll('staff', staffUserId);
    await this.audit.record({
      action: 'staff.password_reset',
      entityId: staffUserId,
    });
    return { temporaryPassword };
  }

  private assertAllowed(
    action: StaffAction,
    target: MembershipWithUser | null,
  ) {
    const denial = staffActionDenial(
      action,
      target,
      this.tenant.scope.merchantStatus,
    );
    if (denial) throw new AppException(denial);
  }

  private async find(staffUserId: string): Promise<MembershipWithUser> {
    const membership = await this.tenant.db.staffMembership.findUnique({
      where: {
        staffUserId_merchantId: {
          staffUserId,
          merchantId: this.tenant.scope.merchantId,
        },
      },
      ...withUser,
    });
    if (!membership) throw new AppException('NOT_FOUND');
    return membership;
  }

  // En el panel, RLS solo deja ver este comercio: la consulta va aparte, con
  // la variable de esa persona.
  private async worksElsewhere(staffUserId: string): Promise<boolean> {
    const { merchantId } = this.tenant.scope;
    const others = await runWithSetting(
      this.prisma,
      'app.staff_user_id',
      staffUserId,
      (tx) =>
        tx.staffMembership.count({
          where: { staffUserId, merchantId: { not: merchantId } },
        }),
    );
    return others > 0;
  }
}

function toStaffMember(membership: MembershipWithUser): StaffMember {
  return {
    staffUserId: membership.staffUserId,
    name: membership.staffUser.name,
    email: membership.staffUser.email,
    role: membership.role,
    active: membership.active,
    pendingFirstLogin: membership.staffUser.mustChangePassword,
    createdAt: membership.createdAt.toISOString(),
  };
}
