import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { User } from 'src/tenant-db/entities/user.entity';
import { Business, BusinessStatus } from 'src/tenant-db/entities/business.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import {
  ensureSuperAdminRole,
  linkUserToBusiness,
} from 'src/tenant-db/helpers/tenant-business-bootstrap.helper';
import { seedDefaultChartOfAccountsForBusiness } from 'src/tenant-db/helpers/chart-of-account-bootstrap.helper';
import { CreateTenantBusinessDto } from '../dto/business/create-tenant-business.dto';
import { AssignBusinessMemberDto } from '../dto/business/assign-business-member.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class TenantBusinessService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private async assertSuperAdmin(tenantDb: DataSource, userId: string) {
    const user = await tenantDb.getRepository(User).findOne({
      where: { id: userId, deletedAt: IsNull() },
      select: ['id', 'isSuperAdmin'],
    });
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super admin only');
    }
  }

  async listBusinesses(tenantDb: DataSource, actorUserId: string, page: number, limit: number) {
    await this.assertSuperAdmin(tenantDb, actorUserId);
    const skip = (page - 1) * limit;
    const [businesses, total] = await tenantDb.getRepository(Business).findAndCount({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'BUSINESS_LISTED',
      description: 'Businesses listed for assignment',
      metadata: { count: businesses.length },
    });

    return { data: businesses, meta: { total, page, limit } };
  }

  async createBusiness(
    tenantDb: DataSource,
    dto: CreateTenantBusinessDto,
    actorUserId: string,
  ) {
    await this.assertSuperAdmin(tenantDb, actorUserId);

    const name = dto.name.trim();
    const businessRepo = tenantDb.getRepository(Business);

    const existing = await businessRepo.findOne({
      where: { name, deletedAt: IsNull() },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('Business name already exists');
    }

    const saved = await tenantDb.transaction(async (manager) => {
      const business = await manager.save(
        manager.create(Business, {
          name,
          legalName: dto.legalName?.trim() ?? null,
          status: BusinessStatus.ACTIVE,
        }),
      );

      const chartOfAccounts = await seedDefaultChartOfAccountsForBusiness(
        manager,
        business.id,
      );
      const superAdminRole = await ensureSuperAdminRole(manager);
      const membership = await linkUserToBusiness(
        manager,
        actorUserId,
        business.id,
        superAdminRole.id,
      );

      return { business, chartOfAccounts, superAdminRole, membership };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'BUSINESS_CREATED',
      description: `Business ${saved.business.name} created`,
      metadata: {
        businessId: saved.business.id,
        chartOfAccountCount: saved.chartOfAccounts.length,
        roleId: saved.superAdminRole.id,
        userBusinessId: saved.membership.id,
      },
    });

    return {
      ...saved.business,
      superAdminRoleId: saved.superAdminRole.id,
      userBusinessId: saved.membership.id,
    };
  }

  async assignMember(
    tenantDb: DataSource,
    businessId: string,
    dto: AssignBusinessMemberDto,
    actorUserId: string,
  ) {
    await this.assertSuperAdmin(tenantDb, actorUserId);

    const business = await tenantDb.getRepository(Business).findOne({
      where: { id: businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const role = await tenantDb.getRepository(Role).findOne({
      where: { id: dto.roleId, deletedAt: IsNull() },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const targetUser = await tenantDb.getRepository(User).findOne({
      where: { id: dto.userId, deletedAt: IsNull() },
    });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const saved = await linkUserToBusiness(
      tenantDb,
      dto.userId,
      businessId,
      dto.roleId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'BUSINESS_MEMBER_ASSIGNED',
      description: `User ${dto.userId} assigned to business ${businessId}`,
      metadata: {
        userBusinessId: saved.id,
        roleId: dto.roleId,
      },
    });

    return saved;
  }
  
}
