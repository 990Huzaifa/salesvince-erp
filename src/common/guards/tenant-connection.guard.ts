import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';

@Injectable()
export class TenantConnectionGuard implements CanActivate {
  constructor(
    private readonly tenantConnectionManager: TenantConnectionManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    req.tenantDb = await this.tenantConnectionManager.getConnection(tenantId);
    return true;
  }
}
