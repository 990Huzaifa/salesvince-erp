import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext } from './tenant-context';

export const TenantConnection = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DataSource => {
    const req = ctx.switchToHttp().getRequest<{ tenantDb?: DataSource }>();
    if (!req.tenantDb) {
      throw new InternalServerErrorException(
        'Tenant connection is not available on request',
      );
    }

    return req.tenantDb;
  },
);

export const TenantCode = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ tenant?: TenantContext }>();
    if (!req.tenant) {
      throw new InternalServerErrorException(
        'Tenant context is not available on request',
      );
    }

    return req.tenant.code;
  },
);

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ tenant?: TenantContext }>();
    if (!req.tenant?.tenantId) {
      throw new InternalServerErrorException(
        'Tenant id is not available on request',
      );
    }

    return req.tenant.tenantId;
  },
);
