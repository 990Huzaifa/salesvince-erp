import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantStatus } from 'src/master-db/entities/tenant.entity';

/**
 * Builds `req.tenant` from JWT claims only (no Master DB round-trip per request).
 * Tenant was validated once at login; `tenantStatus` is the claim from issuance.
 */
@Injectable()
export class TenantJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as
      | {
          tenantId?: string;
          tenantStatus?: TenantStatus;
          tenantCode?: string;
        }
      | undefined;
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('tenantId claim missing in JWT');
    }

    const status =
      user.tenantStatus ?? TenantStatus.PROVISIONED;

    if (status !== TenantStatus.PROVISIONED) {
      throw new ForbiddenException(
        `Tenant access blocked (status: ${status})`,
      );
    }

    req.tenant = {
      isPlatform: false,
      tenantId,
      code: user.tenantCode,
      status,
    };

    return true;
  }
}
