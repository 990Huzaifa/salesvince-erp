import {Injectable, NestMiddleware, NotFoundException, BadRequestException} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../master-db/entities/tenant.entity';

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
    ) { }

    async use(req: Request, _res: Response, next: NextFunction) {
        const hostHeader = (req.headers.host || '').toLowerCase();
        const host = hostHeader.split(':')[0]; // remove port

        // 1️⃣ Platform routes OR platform subdomain
        if (
            req.path.startsWith('/platform') ||
            host.startsWith('platform.')
        ) {
            req.tenant = {
                isPlatform: true,
            };
            return next();
        }

        // 2️⃣ Extract subdomain → tenant.name
        const tenantName = this.extractTenantName(host);
        if (!tenantName) {
            throw new NotFoundException('Tenant not found');
        }

        // 3️⃣ Lookup by tenant.name (subdomain)
        const tenant = await this.tenantRepo.findOne({
            where: {
                name: tenantName,
                isActive: true,
            },
            select: ['id', 'name', 'code'],
        });

        if (!tenant) {
            throw new NotFoundException('Tenant not found');
        }

        // 4️⃣ Attach tenant context
        req.tenant = {
            isPlatform: false,
            tenantId: tenant.id,
            name: tenant.name,
            code: tenant.code,
            status: tenant.status,
        };

        return next();
    }

    private extractTenantName(host: string): string | null {
        const domain = (process.env.DOMAIN || '').toLowerCase();

        // dev support
        if (host.endsWith('.localhost')) {
            return host.split('.')[0];
        }

        // production
        if (domain && host.endsWith(`.${domain}`)) {
            const sub = host.slice(0, -(domain.length + 1));
            return sub.split('.')[0] || null;
        }

        return null;
    }
}
