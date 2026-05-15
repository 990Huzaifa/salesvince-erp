import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantStatus } from '../../master-db/entities/tenant.entity';

@Injectable()
export class TenantActiveGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();

        // 🔓 Platform routes bypass
        if (req.tenant?.isPlatform) {
            return true;
        }

        // ❌ No tenant resolved
        if (!req.tenant) {
            throw new ForbiddenException('Tenant context missing');
        }

        // ❌ Block suspended / inactive tenants
        if (req.tenant.status !== TenantStatus.PROVISIONED) {
            throw new ForbiddenException(
                `Tenant access blocked (status: ${req.tenant.status})`,
            );
        }

        return true;
    }
}
