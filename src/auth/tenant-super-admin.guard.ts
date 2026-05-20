import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { User } from 'src/tenant-db/entities/user.entity';
import type { TenantRequestUser } from './tenant-jwt.strategy';

type TenantSuperAdminRequest = Request & {
  user?: TenantRequestUser;
  tenantDb?: DataSource;
};

@Injectable()
export class TenantSuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<TenantSuperAdminRequest>();
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
      select: ['id', 'isSuperAdmin'],
    });

    if (!tenantUser?.isSuperAdmin) {
      throw new ForbiddenException('Super admin only');
    }

    return true;
  }
}
