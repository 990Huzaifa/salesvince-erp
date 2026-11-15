import { DataSource } from 'typeorm';
import { User } from 'src/tenant-db/entities/user.entity';
import {
  UserBusiness,
  UserBusinessStatus,
} from 'src/tenant-db/entities/user-business.entity';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';

export async function loadUserPermissionKeys(
  tenantDb: DataSource,
  user: TenantRequestUser,
): Promise<{ isSuperAdmin: boolean; permissionKeys: string[] }> {
  const tenantUser = await tenantDb.getRepository(User).findOne({
    where: { id: user.userId },
  });

  if (!tenantUser) {
    return { isSuperAdmin: false, permissionKeys: [] };
  }

  if (tenantUser.isSuperAdmin) {
    return { isSuperAdmin: true, permissionKeys: [] };
  }

  if (!user.userBusinessId || !user.businessId) {
    return { isSuperAdmin: false, permissionKeys: [] };
  }

  const userBusiness = await tenantDb.getRepository(UserBusiness).findOne({
    where: {
      id: user.userBusinessId,
      userId: user.userId,
      businessId: user.businessId,
      status: UserBusinessStatus.ACTIVE,
    },
    relations: [
      'role',
      'role.rolePermissions',
      'role.rolePermissions.permission',
    ],
  });

  const permissionKeys = (userBusiness?.role?.rolePermissions ?? [])
    .map((rp) => rp.permission?.key)
    .filter((k): k is string => Boolean(k));

  return { isSuperAdmin: false, permissionKeys };
}
