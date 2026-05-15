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

type TenantRequestUser = {
  userId?: string;
  role?: string;
};

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

    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    const tenantUser = await tenantDb.getRepository(User).findOne({
      where: { id: user.userId },
      relations: ['role', 'role.permissions'],
    });

    if (!tenantUser?.role) {
      throw new ForbiddenException('Tenant role not assigned');
    }

    if (tenantUser.role.code === 'SUPER_ADMIN') {
      return true;
    }

    const rolePermissions = tenantUser.role.permissions ?? [];
    if (rolePermissions.length === 0) {
      throw new ForbiddenException('Tenant role has no permissions assigned');
    }

    const userPermissionCodes = rolePermissions.map((permission) =>
      permission.code.toUpperCase(),
    );
    const normalizedRequired = requiredPermissions.map((permission) =>
      permission.toUpperCase(),
    );

    const hasPermission = normalizedRequired.some((permission) =>
      userPermissionCodes.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
