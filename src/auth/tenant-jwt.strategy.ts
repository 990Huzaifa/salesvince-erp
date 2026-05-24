import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantStatus } from 'src/master-db/entities/tenant.entity';
import {
  BUSINESS_ACCESS_TOKEN,
  TENANT_LOGIN_TOKEN,
} from './tenant-jwt.constants';

export type TenantJwtPayload = {
  sub?: string;
  userId?: string;
  tenantId: string;
  userCode?: string;
  /** @deprecated use tokenType + business-scoped RBAC */
  role?: string;
  tenantStatus?: TenantStatus;
  tenantCode?: string;
  tenantName?: string;
  type?: string;
  tokenType?: typeof TENANT_LOGIN_TOKEN | typeof BUSINESS_ACCESS_TOKEN;
  businessId?: string;
  businessCode?: string;
  userBusinessId?: string;
  roleId?: string;
};

export type TenantRequestUser = {
  userId: string;
  userCode?: string;
  tenantId: string;
  tenantCode?: string;
  tenantName?: string;
  tenantStatus?: TenantStatus;
  tokenType: typeof TENANT_LOGIN_TOKEN | typeof BUSINESS_ACCESS_TOKEN;
  businessId?: string;
  businessCode?: string;
  userBusinessId?: string;
  roleId?: string;
};

@Injectable()
export class TenantJwtStrategy extends PassportStrategy(Strategy, 'tenant-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  validate(payload: TenantJwtPayload): TenantRequestUser {
    const userId = payload.userId ?? payload.sub;
    if (!userId || !payload.tenantId) {
      throw new UnauthorizedException();
    }

    const tokenType = payload.tokenType;

    if (tokenType === TENANT_LOGIN_TOKEN) {
      return {
        userId,
        userCode: payload.userCode,
        tenantId: payload.tenantId,
        tenantCode: payload.tenantCode,
        tenantName: payload.tenantName,
        tenantStatus: payload.tenantStatus,
        tokenType: TENANT_LOGIN_TOKEN,
      };
    }

    if (tokenType === BUSINESS_ACCESS_TOKEN) {
      if (!payload.businessId || !payload.userBusinessId || !payload.roleId) {
        throw new UnauthorizedException();
      }
      return {
        userId,
        userCode: payload.userCode,
        tenantId: payload.tenantId,
        tenantCode: payload.tenantCode,
        tenantName: payload.tenantName,
        tenantStatus: payload.tenantStatus,
        tokenType: BUSINESS_ACCESS_TOKEN,
        businessId: payload.businessId,
        businessCode: payload.businessCode,
        userBusinessId: payload.userBusinessId,
        roleId: payload.roleId,
      };
    }

    throw new UnauthorizedException();
  }
}
