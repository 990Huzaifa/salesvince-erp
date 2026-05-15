import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantStatus } from 'src/master-db/entities/tenant.entity';

export type TenantJwtPayload = {
  sub?: string;
  userId?: string;
  tenantId: string;
  role: string;
  tenantStatus?: TenantStatus;
  tenantCode?: string;
  tenantName?: string;
  type?: string;
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

  validate(payload: TenantJwtPayload) {
    if (payload.type !== 'tenant') {
      throw new UnauthorizedException();
    }
    const userId = payload.userId ?? payload.sub;
    if (!userId || !payload.tenantId) {
      throw new UnauthorizedException();
    }
    return {
      userId,
      tenantId: payload.tenantId,
      role: payload.role,
      tenantStatus: payload.tenantStatus,
      tenantCode: payload.tenantCode,
      tenantName: payload.tenantName,
    };
  }
}
