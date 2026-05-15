import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { TENANT_LOGIN_TOKEN } from './tenant-jwt.constants';

@Injectable()
export class TenantLoginOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const tokenType = (req.user as { tokenType?: string } | undefined)?.tokenType;

    if (tokenType !== TENANT_LOGIN_TOKEN) {
      throw new ForbiddenException('Tenant login session required');
    }

    return true;
  }
}
