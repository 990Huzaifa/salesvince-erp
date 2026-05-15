import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { PERMISSION_KEY } from './require-permission.decorator';
import { User } from 'src/tenant-db/entities/user.entity';
import { UserBusiness, UserBusinessStatus } from 'src/tenant-db/entities/user-business.entity';
import { RoleStatus } from 'src/tenant-db/entities/role.entity';
import type { TenantRequestUser } from './tenant-jwt.strategy';

type TenantPermissionRequest = Request & {
  user?: TenantRequestUser;
  tenantDb?: DataSource;
};

@Injectable()
export class TenantPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantPermissionRequest>();
    const user = request.user;
    const tenantDb = request.tenantDb;

    if (!user?.userId) {
      throw new ForbiddenException('Tenant user not found in request');
    }

    if (!tenantDb) {
      throw new ForbiddenException('Tenant database connection missing');
    }

    const tenantUser = await tenantDb.getRepository(User).findOne({
      where: { id: user.userId },
    });

    if (!tenantUser) {
      throw new ForbiddenException('User not found');
    }

    if (tenantUser.isSuperAdmin) {
      return true;
    }

    if (!user.userBusinessId || !user.businessId) {
      throw new ForbiddenException('Business context required for this action');
    }

    const userBusiness = await tenantDb.getRepository(UserBusiness).findOne({
      where: {
        id: user.userBusinessId,
        userId: user.userId,
        businessId: user.businessId,
      },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission'],
    });

    if (!userBusiness || userBusiness.status !== UserBusinessStatus.ACTIVE) {
      throw new ForbiddenException('Business access is not active');
    }

    if (!userBusiness.role || userBusiness.role.status !== RoleStatus.ACTIVE) {
      throw new ForbiddenException('Role is not active');
    }

    const rolePermissions = userBusiness.role.rolePermissions ?? [];
    const keys = rolePermissions
      .map((rp) => rp.permission?.key)
      .filter((k): k is string => Boolean(k));

    if (keys.length === 0) {
      throw new ForbiddenException('Role has no permissions assigned');
    }

    const userPermissionKeys = keys.map((k) => k.toUpperCase());
    const normalizedRequired = requiredPermissions.map((p) => p.toUpperCase());

    const hasPermission = normalizedRequired.some((p) =>
      userPermissionKeys.includes(p),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
