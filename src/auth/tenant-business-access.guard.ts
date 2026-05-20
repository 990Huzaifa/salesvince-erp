import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { User } from 'src/tenant-db/entities/user.entity';
import {
  BUSINESS_ACCESS_TOKEN,
  TENANT_LOGIN_TOKEN,
} from './tenant-jwt.constants';
import type { TenantRequestUser } from './tenant-jwt.strategy';

type Req = Request & {
  user?: TenantRequestUser;
  tenantDb?: DataSource;
};

@Injectable()
export class TenantBusinessAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Req>();
    const user = req.user;
    const tenantDb = req.tenantDb;

    if (!user?.userId) {
      throw new ForbiddenException('Tenant user not found in request');
    }

    if (!tenantDb) {
      throw new ForbiddenException('Tenant database connection missing');
    }

    if (user.tokenType === BUSINESS_ACCESS_TOKEN) {
      return true;
    }

    throw new ForbiddenException('Business access token required');
  }
}
