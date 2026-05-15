import { DataSource, EntityManager, IsNull } from 'typeorm';

type TenantDb = DataSource | EntityManager;
import { Permission } from '../entities/permission.entity';
import { Role, RoleStatus } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import {
  UserBusiness,
  UserBusinessStatus,
} from '../entities/user-business.entity';

export const TENANT_SUPER_ADMIN_ROLE_NAME = 'Super Admin';

/**
 * Ensures a tenant-wide Super Admin role exists and syncs all catalog permissions via role_permissions.
 */
export async function ensureSuperAdminRole(tenantDb: TenantDb): Promise<Role> {
  const roleRepo = tenantDb.getRepository(Role);
  const permissionRepo = tenantDb.getRepository(Permission);
  const rolePermissionRepo = tenantDb.getRepository(RolePermission);

  let role = await roleRepo.findOne({
    where: {
      name: TENANT_SUPER_ADMIN_ROLE_NAME,
      deletedAt: IsNull(),
    },
  });

  if (!role) {
    role = roleRepo.create({
      name: TENANT_SUPER_ADMIN_ROLE_NAME,
      description: 'Full access (system role)',
      isSystemRole: true,
      status: RoleStatus.ACTIVE,
    });
    role = await roleRepo.save(role);
  } else {
    let shouldUpdate = false;
    if (role.status !== RoleStatus.ACTIVE) {
      role.status = RoleStatus.ACTIVE;
      shouldUpdate = true;
    }
    if (!role.isSystemRole) {
      role.isSystemRole = true;
      shouldUpdate = true;
    }
    if (role.deletedAt != null) {
      role.deletedAt = null;
      shouldUpdate = true;
    }
    if (shouldUpdate) {
      role = await roleRepo.save(role);
    }
  }

  const permissions = await permissionRepo.find();
  for (const permission of permissions) {
    const existing = await rolePermissionRepo.findOne({
      where: { roleId: role.id, permissionId: permission.id },
    });
    if (!existing) {
      await rolePermissionRepo.save(
        rolePermissionRepo.create({
          roleId: role.id,
          permissionId: permission.id,
        }),
      );
    }
  }

  return role;
}

/**
 * Links a user to a business with the given role (one role per business per user).
 */
export async function linkUserToBusiness(
  tenantDb: TenantDb,
  userId: string,
  businessId: string,
  roleId: string,
): Promise<UserBusiness> {
  const ubRepo = tenantDb.getRepository(UserBusiness);

  let ub = await ubRepo.findOne({
    where: { userId, businessId, deletedAt: IsNull() },
  });

  if (ub) {
    ub.roleId = roleId;
    ub.status = UserBusinessStatus.ACTIVE;
    if (ub.deletedAt != null) {
      ub.deletedAt = null;
    }
  } else {
    ub = ubRepo.create({
      userId,
      businessId,
      roleId,
      status: UserBusinessStatus.ACTIVE,
    });
  }

  return ubRepo.save(ub);
}
