import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
} from 'typeorm';
import { Role, RoleStatus } from 'src/tenant-db/entities/role.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { RolePermission } from 'src/tenant-db/entities/role-permission.entity';
import { UserBusiness } from 'src/tenant-db/entities/user-business.entity';
import { CreateTenantRoleDto } from '../dto/role/create-tenant-role.dto';
import { UpdateTenantRoleDto } from '../dto/role/update-tenant-role.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class TenantRoleService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private async findRole(
    tenantDb: DataSource,
    roleId: string,
    withPermissions = false,
  ): Promise<Role> {
    const role = await tenantDb.getRepository(Role).findOne({
      where: { id: roleId, deletedAt: IsNull() },
      relations: withPermissions
        ? { rolePermissions: { permission: true } }
        : undefined,
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  private async resolvePermissionsByKeys(
    tenantDb: DataSource | EntityManager,
    keys: string[],
  ): Promise<Permission[]> {
    const uniqueKeys = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    if (uniqueKeys.length === 0) {
      throw new NotFoundException('At least one permission is required');
    }

    const permissions = await tenantDb.getRepository(Permission).find({
      where: { key: In(uniqueKeys) },
    });

    if (permissions.length !== uniqueKeys.length) {
      throw new NotFoundException('One or more permissions not found');
    }

    return permissions;
  }

  /** Replaces role_permissions rows so the role mirrors the submitted permission keys. */
  private async syncRolePermissions(
    manager: EntityManager,
    roleId: string,
    permissionIds: string[],
  ): Promise<void> {
    await manager.delete(RolePermission, { roleId });
    if (permissionIds.length === 0) {
      return;
    }
    await manager.save(
      permissionIds.map((permissionId) =>
        manager.create(RolePermission, { roleId, permissionId }),
      ),
    );
  }

  private async bumpPermissionVersionForRole(
    manager: EntityManager,
    roleId: string,
  ): Promise<void> {
    const ubRepo = manager.getRepository(UserBusiness);
    const memberships = await ubRepo.find({
      where: { roleId, deletedAt: IsNull() },
      select: ['id', 'permissionVersion'],
    });
    for (const membership of memberships) {
      membership.permissionVersion += 1;
    }
    if (memberships.length > 0) {
      await ubRepo.save(memberships);
    }
  }

  private mapRoleResponse(role: Role) {
    const permissionKeys =
      role.rolePermissions
        ?.map((rp) => rp.permission?.key)
        .filter((key): key is string => Boolean(key)) ?? [];

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystemRole: role.isSystemRole,
      status: role.status,
      permissions: permissionKeys,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private assertNotSystemRole(role: Role): void {
    if (role.isSystemRole) {
      throw new ForbiddenException('System roles cannot be modified');
    }
  }

  async listPermissions(tenantDb: DataSource) {
    const permissions = await tenantDb.getRepository(Permission).find({
      select: ['id', 'key', 'name'],
      order: { name: 'ASC' },
    });
    return { data: permissions };
  }

  async listRoles(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    actorUserId: string,
  ) {
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const take = Math.max(1, limit);

    const qb = tenantDb
      .getRepository(Role)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.rolePermissions', 'rp')
      .leftJoinAndSelect('rp.permission', 'p')
      .where('r.deletedAt IS NULL')
      .orderBy('r.name', 'ASC')
      .skip(skip)
      .take(take);

    if (search?.trim()) {
      qb.andWhere('r.name ILIKE :search', { search: `%${search.trim()}%` });
    }

    const [roles, total] = await qb.getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: null,
      action: 'ROLE_LISTED',
      description: 'Roles listed',
      metadata: { count: roles.length },
    });

    return {
      data: roles.map((role) => this.mapRoleResponse(role)),
      meta: { total, page: Math.max(1, page), limit: take },
    };
  }

  async getRoleById(
    tenantDb: DataSource,
    roleId: string,
    actorUserId: string,
  ) {
    const role = await this.findRole(tenantDb, roleId, true);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: null,
      action: 'ROLE_VIEWED',
      description: `Role ${role.name} viewed`,
      metadata: { roleId: role.id },
    });

    return { data: this.mapRoleResponse(role) };
  }

  async createRole(
    tenantDb: DataSource,
    dto: CreateTenantRoleDto,
    actorUserId: string,
  ) {
    const name = dto.name.trim();

    const existing = await tenantDb.getRepository(Role).findOne({
      where: { name, deletedAt: IsNull() },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('Role name already exists');
    }

    const permissions = await this.resolvePermissionsByKeys(
      tenantDb,
      dto.permissions,
    );

    const saved = await tenantDb.transaction(async (manager) => {
      const role = await manager.save(
        manager.create(Role, {
          name,
          description: dto.description?.trim() ?? null,
          isSystemRole: false,
          status: dto.status ?? RoleStatus.ACTIVE,
        }),
      );

      await this.syncRolePermissions(
        manager,
        role.id,
        permissions.map((p) => p.id),
      );

      return manager.findOne(Role, {
        where: { id: role.id },
        relations: { rolePermissions: { permission: true } },
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: null,
      action: 'ROLE_CREATED',
      description: `Role ${name} created`,
      metadata: {
        roleId: saved!.id,
        permissionCount: permissions.length,
      },
    });

    return { data: this.mapRoleResponse(saved!) };
  }

  async updateRole(
    tenantDb: DataSource,
    roleId: string,
    dto: UpdateTenantRoleDto,
    actorUserId: string,
  ) {
    const role = await this.findRole(tenantDb, roleId);
    this.assertNotSystemRole(role);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await tenantDb.getRepository(Role).findOne({
        where: { name, deletedAt: IsNull() },
        select: ['id'],
      });
      if (duplicate && duplicate.id !== roleId) {
        throw new ConflictException('Role name already exists');
      }
      role.name = name;
    }

    if (dto.description !== undefined) {
      role.description = dto.description?.trim() ?? null;
    }

    if (dto.status !== undefined) {
      role.status = dto.status;
    }

    const permissions =
      dto.permissions !== undefined
        ? await this.resolvePermissionsByKeys(tenantDb, dto.permissions)
        : null;

    const updated = await tenantDb.transaction(async (manager) => {
      await manager.save(role);

      if (permissions) {
        await this.syncRolePermissions(
          manager,
          role.id,
          permissions.map((p) => p.id),
        );
        await this.bumpPermissionVersionForRole(manager, role.id);
      }

      return manager.findOne(Role, {
        where: { id: role.id },
        relations: { rolePermissions: { permission: true } },
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: null,
      action: 'ROLE_UPDATED',
      description: `Role ${updated!.name} updated`,
      metadata: {
        roleId: updated!.id,
        permissionsUpdated: permissions !== null,
      },
    });

    return { data: this.mapRoleResponse(updated!) };
  }

  async deleteRole(
    tenantDb: DataSource,
    roleId: string,
    actorUserId: string,
  ) {
    const role = await this.findRole(tenantDb, roleId);
    this.assertNotSystemRole(role);

    const assignedCount = await tenantDb.getRepository(UserBusiness).count({
      where: { roleId, deletedAt: IsNull() },
    });
    if (assignedCount > 0) {
      throw new ConflictException(
        'Role is assigned to users and cannot be deleted',
      );
    }

    role.status = RoleStatus.INACTIVE;
    role.deletedAt = new Date();
    await tenantDb.getRepository(Role).save(role);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: null,
      action: 'ROLE_DELETED',
      description: `Role ${role.name} deleted`,
      metadata: { roleId: role.id },
    });

    return { message: 'Role deleted successfully' };
  }
}
