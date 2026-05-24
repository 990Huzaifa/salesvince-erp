import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant, TenantStatus } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { User, UserStatus } from 'src/tenant-db/entities/user.entity';
import {
  UserBusiness,
  UserBusinessStatus,
} from 'src/tenant-db/entities/user-business.entity';
import { RoleStatus } from 'src/tenant-db/entities/role.entity';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';
import { SelectBusinessDto } from '../dto/select-business.dto';
import {
  BUSINESS_ACCESS_TOKEN,
  TENANT_LOGIN_TOKEN,
} from 'src/auth/tenant-jwt.constants';

export type TenantLoginBusinessRow = {
  businessId: string;
  businessCode: string;
  businessName: string;
  businessStatus: string;
  userBusinessId: string;
  roleId: string;
  roleName: string;
  userBusinessStatus: string;
};

export type TenantLoginCapabilities = {
  canManageTenant: boolean;
  canEnterErp: boolean;
};

export type TenantLoginResponse = {
  access_token: string;
  token_type: typeof TENANT_LOGIN_TOKEN;
  isSuperAdmin: boolean;
  user: {
    id: string;
    code: string;
    name: string;
    email: string;
    lastLoginAt: Date | null;
  };
  capabilities: TenantLoginCapabilities;
  businesses: TenantLoginBusinessRow[];
};

export type TenantBusinessAccessResponse = {
  access_token: string;
  token_type: typeof BUSINESS_ACCESS_TOKEN;
};

@Injectable()
export class TenantAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  private extractTenantName(host: string): string | null {
    const domain = (process.env.DOMAIN || '').toLowerCase();
    const h = host.toLowerCase();
    if (h.endsWith('.localhost')) {
      return h.split('.')[0] || null;
    }
    if (domain && h.endsWith(`.${domain}`)) {
      const sub = h.slice(0, -(domain.length + 1));
      return sub.split('.')[0] || null;
    }
    return null;
  }

  private async resolveTenant(
    tenantHost: string | undefined,
    tenantCodeFromBody?: string,
  ): Promise<Tenant> {
    let tenant: Tenant | null = null;

    if (tenantCodeFromBody?.trim()) {
      tenant = await this.tenantRepo.findOne({
        where: {
          code: tenantCodeFromBody.trim(),
          isActive: true,
        },
      });
    } else if (tenantHost) {
      const tenantName = this.extractTenantName(tenantHost);
      if (!tenantName) {
        throw new NotFoundException('Tenant not found');
      }
      tenant = await this.tenantRepo.findOne({
        where: { name: tenantName, isActive: true },
      });
    }

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== TenantStatus.PROVISIONED) {
      throw new ForbiddenException(
        `Tenant is not available (status: ${tenant.status})`,
      );
    }

    return tenant;
  }

  private signTenantLoginJwt(
    userId: string,
    tenant: Tenant,
    userCode: string,
  ): string {
    const expiresIn = (
      process.env.JWT_TENANT_LOGIN_EXPIRES_IN ||
      process.env.JWT_EXPIRES_IN ||
      '1h'
    ) as SignOptions['expiresIn'];

    return this.jwtService.sign(
      {
        tokenType: TENANT_LOGIN_TOKEN,
        sub: userId,
        userId,
        userCode,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        tenantStatus: tenant.status,
        tenantName: tenant.name,
      },
      { expiresIn },
    );
  }

  private signBusinessAccessJwt(
    userId: string,
    tenant: Tenant,
    row: {
      businessId: string;
      businessCode: string;
      userBusinessId: string;
      roleId: string;
      userCode: string;
    },
  ): string {
    const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
    return this.jwtService.sign(
      {
        tokenType: BUSINESS_ACCESS_TOKEN,
        sub: userId,
        userId,
        userCode: row.userCode,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        tenantStatus: tenant.status,
        tenantName: tenant.name,
        businessId: row.businessId,
        businessCode: row.businessCode,
        userBusinessId: row.userBusinessId,
        roleId: row.roleId,
      },
      { expiresIn },
    );
  }

  private buildLoginResponse(
    user: User,
    tenant: Tenant,
    businesses: TenantLoginBusinessRow[],
  ): TenantLoginResponse {
    const isSuperAdmin = user.isSuperAdmin === true;
    return {
      access_token: this.signTenantLoginJwt(user.id, tenant, user.code),
      token_type: TENANT_LOGIN_TOKEN,
      isSuperAdmin,
      user: {
        id: user.id,
        code: user.code,
        name: user.name,
        email: user.email,
        lastLoginAt: user.lastLoginAt,
      },
      capabilities: {
        canManageTenant: isSuperAdmin,
        canEnterErp: businesses.length > 0,
      },
      businesses,
    };
  }

  private async buildBusinessesList(
    tenantDb: DataSource,
    userId: string,
  ): Promise<TenantLoginBusinessRow[]> {
    const ubRepo = tenantDb.getRepository(UserBusiness);
    const rows = await ubRepo.find({
      where: { userId, deletedAt: IsNull() },
      relations: ['business', 'role'],
      order: { lastSelectedAt: 'DESC', createdAt: 'ASC' },
    });

    return rows.map((ub) => ({
      businessId: ub.businessId,
      businessCode: ub.business?.code ?? '',
      businessName: ub.business?.name ?? '',
      businessStatus: ub.business?.status ?? '',
      userBusinessId: ub.id,
      roleId: ub.roleId,
      roleName: ub.role?.name ?? '',
      userBusinessStatus: ub.status,
    }));
  }

  async login(
    dto: TenantLoginDto,
    tenantHost?: string,
  ): Promise<TenantLoginResponse> {
    const tenant = await this.resolveTenant(tenantHost, dto.tenantCode);
    const tenantDb = await this.tenantConnectionManager.getConnection(
      tenant.id,
    );

    const userRepo = tenantDb.getRepository(User);
    const email = dto.email.trim().toLowerCase();
    const user = await userRepo.findOne({
      where: { email, deletedAt: IsNull() },
    });

    if (!user?.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(`User is not active (${user.status})`);
    }

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    user.lastLoginAt = new Date();
    await userRepo.save(user);

    const businesses = await this.buildBusinessesList(tenantDb, user.id);

    return this.buildLoginResponse(user, tenant, businesses);
  }

  async selectBusiness(
    dto: SelectBusinessDto,
    jwtUser: {
      userId: string;
      userCode: string;
      userName: string;
      userEmail: string;
      lastLoginAt: Date | null;
      tenantId: string;
      tokenType?: string;
    },
  ): Promise<TenantBusinessAccessResponse> {
    if (jwtUser.tokenType !== TENANT_LOGIN_TOKEN) {
      throw new ForbiddenException('Business selection requires a tenant login session');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: jwtUser.tenantId, isActive: true },
    });
    if (!tenant || tenant.status !== TenantStatus.PROVISIONED) {
      throw new ForbiddenException('Tenant not available');
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(
      tenant.id,
    );

    const ubRepo = tenantDb.getRepository(UserBusiness);
    const ub = await ubRepo.findOne({
      where: {
        userId: jwtUser.userId,
        businessId: dto.businessId,
        deletedAt: IsNull(),
      },
      relations: ['role', 'business'],
    });

    if (!ub) {
      throw new ForbiddenException('No access to this business');
    }

    if (ub.status !== UserBusinessStatus.ACTIVE) {
      throw new ForbiddenException(
        `Business access is not active (${ub.status})`,
      );
    }

    if (!ub.role || ub.role.status !== RoleStatus.ACTIVE) {
      throw new ForbiddenException('Role is not active');
    }

    ub.lastSelectedAt = new Date();
    await ubRepo.save(ub);

    let userCode = jwtUser.userCode;
    if (!userCode) {
      const dbUser = await tenantDb.getRepository(User).findOne({
        where: { id: jwtUser.userId },
        select: ['code'],
      });
      userCode = dbUser?.code ?? '';
    }

    const businessCode = ub.business?.code ?? '';
    if (!businessCode) {
      throw new ForbiddenException('Business not found');
    }

    return {
      access_token: this.signBusinessAccessJwt(jwtUser.userId, tenant, {
        businessId: dto.businessId,
        businessCode,
        userBusinessId: ub.id,
        roleId: ub.roleId,
        userCode,
      }),
      token_type: BUSINESS_ACCESS_TOKEN,
    };
  }

  async setupInvitedUserPassword(
    dto: SetupTenantUserPasswordDto,
    tenantHost?: string,
  ): Promise<TenantLoginResponse> {
    let payload: { type?: string; userId?: string; email?: string };
    try {
      payload = this.jwtService.verify(dto.token, {
        secret: process.env.JWT_SECRET,
      }) as { type?: string; userId?: string; email?: string };
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }

    if (payload.type !== 'tenant_user_invite') {
      throw new BadRequestException('Invalid token type');
    }

    const tenant = await this.resolveTenant(tenantHost, dto.tenantCode);
    const tenantDb = await this.tenantConnectionManager.getConnection(
      tenant.id,
    );

    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: payload.userId, deletedAt: IsNull() },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email !== payload.email) {
      throw new BadRequestException('Token does not match user');
    }

    user.password = await bcrypt.hash(dto.password, 10);
    user.lastLoginAt = new Date();
    await userRepo.save(user);

    const businesses = await this.buildBusinessesList(tenantDb, user.id);

    return this.buildLoginResponse(user, tenant, businesses);
  }
}
