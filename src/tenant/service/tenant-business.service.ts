import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { User } from 'src/tenant-db/entities/user.entity';
import { Business, BusinessStatus } from 'src/tenant-db/entities/business.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Asset, AssetStatus } from 'src/tenant-db/entities/asset.entity';
import {
  ensureSuperAdminRole,
  linkUserToBusiness,
} from 'src/tenant-db/helpers/tenant-business-bootstrap.helper';
import { seedDefaultChartOfAccountsForBusiness } from 'src/tenant-db/helpers/chart-of-account-bootstrap.helper';
import { S3Service } from 'src/common/s3/s3.service';
import {
  ASSET_RULES,
  AssetEntityType,
  AssetPurpose,
} from '../config/asset-rules.config';
import { CreateTenantBusinessDto } from '../dto/business/create-tenant-business.dto';
import { UpdateTenantBusinessDto } from '../dto/business/update-tenant-business.dto';
import { AssignBusinessMemberDto } from '../dto/business/assign-business-member.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class TenantBusinessService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
  ) {}

  private async generateUniqueBusinessCode(
    businessRepo: Repository<Business>,
  ): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await businessRepo.findOne({
        where: { code, deletedAt: IsNull() },
        select: ['id'],
      });
      if (!existing) {
        return code;
      }
    }
  }

  private async assertSuperAdmin(tenantDb: DataSource, userId: string) {
    const user = await tenantDb.getRepository(User).findOne({
      where: { id: userId, deletedAt: IsNull() },
      select: ['id', 'isSuperAdmin'],
    });
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super admin only');
    }
  }

  private async getApprovedBusinessLogoAsset(
    manager: EntityManager,
    tenantCode: string,
    assetId: string,
    actorUserId: string,
    businessId?: string,
  ): Promise<Asset> {
    const asset = await manager.getRepository(Asset).findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }
    if (asset.uploadedById !== actorUserId) {
      throw new ForbiddenException(`Not allowed to use asset ${assetId}`);
    }
    if (asset.status !== AssetStatus.APPROVED) {
      throw new BadRequestException(
        `Asset ${assetId} must be confirmed (APPROVED) before attaching as a business logo`,
      );
    }
    if (asset.purpose !== AssetPurpose.BUSINESS_LOGO) {
      throw new BadRequestException(`Asset ${assetId} is not a business logo`);
    }
    if (asset.entityType && asset.entityType !== AssetEntityType.BUSINESS) {
      throw new BadRequestException(`Asset ${assetId} is not allowed for a business`);
    }
    if (asset.entityId != null && asset.entityId !== businessId) {
      throw new BadRequestException(`Asset ${assetId} is already linked to an entity`);
    }
    if (asset.entityId == null && asset.attachedAt != null) {
      throw new BadRequestException(`Asset ${assetId} is already linked to an entity`);
    }

    const businessLogoRules = ASSET_RULES[AssetPurpose.BUSINESS_LOGO];
    const tempPrefix = `tenants/${tenantCode}/temp/uploads/${asset.id}.`;
    const finalPrefix = `tenants/${tenantCode}/${businessLogoRules.folder}/${asset.id}.`;
    if (!asset.s3Key.startsWith(tempPrefix) && !asset.s3Key.startsWith(finalPrefix)) {
      throw new BadRequestException(`Asset ${assetId} has an unexpected storage key`);
    }

    return asset;
  }

  private async detachBusinessLogoAsset(
    manager: EntityManager,
    businessId: string,
    excludeAssetId?: string,
  ) {
    const assetRepo = manager.getRepository(Asset);
    const linkedAssets = await assetRepo.find({
      where: {
        entityType: AssetEntityType.BUSINESS,
        entityId: businessId,
        purpose: AssetPurpose.BUSINESS_LOGO,
      },
    });
    for (const asset of linkedAssets) {
      if (excludeAssetId && asset.id === excludeAssetId) {
        continue;
      }
      await assetRepo.update(
        { id: asset.id },
        { entityType: null, entityId: null, attachedAt: null },
      );
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
      businessId: null,
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
    tenantCode: string,
  ) {
    await this.assertSuperAdmin(tenantDb, actorUserId);

    const name = dto.name.trim();
    const logoAssetId = dto.assetId?.trim() || null;
    const businessRepo = tenantDb.getRepository(Business);

    const existing = await businessRepo.findOne({
      where: { name, deletedAt: IsNull() },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('Business name already exists');
    }

    const code = await this.generateUniqueBusinessCode(businessRepo);

    const saved = await tenantDb.transaction(async (manager) => {
      const logoAsset = logoAssetId
        ? await this.getApprovedBusinessLogoAsset(
            manager,
            tenantCode,
            logoAssetId,
            actorUserId,
          )
        : null;
      const business = await manager.save(
        manager.create(Business, {
          name,
          code,
          legalName: dto.legalName?.trim() ?? null,
          logo: logoAsset ? this.s3Service.getObjectUrl(logoAsset.s3Key) : null,
          status: BusinessStatus.ACTIVE,
        }),
      );

      if (logoAsset) {
        await manager.getRepository(Asset).update(
          { id: logoAsset.id },
          {
            entityType: AssetEntityType.BUSINESS,
            entityId: business.id,
            attachedAt: new Date(),
          },
        );
      }

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
      businessId: null,
      action: 'BUSINESS_CREATED',
      description: `Business ${saved.business.name} created`,
      metadata: {
        businessId: saved.business.id,
        logoAssetId,
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

  async updateBusiness(
    tenantDb: DataSource,
    businessId: string,
    dto: UpdateTenantBusinessDto,
    actorUserId: string,
    tenantCode: string,
  ) {
    await this.assertSuperAdmin(tenantDb, actorUserId);

    const businessRepo = tenantDb.getRepository(Business);
    const business = await businessRepo.findOne({
      where: { id: businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const existing = await businessRepo.findOne({
        where: { name, deletedAt: IsNull() },
        select: ['id'],
      });
      if (existing && existing.id !== businessId) {
        throw new ConflictException('Business name already exists');
      }
      business.name = name;
    }

    if (dto.currency !== undefined) {
      business.currency = dto.currency.trim();
    }

    if (dto.address !== undefined) {
      business.address = dto.address?.trim() || null;
    }

    if (dto.phone !== undefined) {
      business.phone = dto.phone?.trim() || null;
    }

    const updated = await tenantDb.transaction(async (manager) => {
      if (dto.assetId !== undefined) {
        const newLogoAssetId = dto.assetId?.trim() || null;
        const currentLogoAsset = await manager.getRepository(Asset).findOne({
          where: {
            entityType: AssetEntityType.BUSINESS,
            entityId: businessId,
            purpose: AssetPurpose.BUSINESS_LOGO,
          },
        });

        if (!newLogoAssetId) {
          await this.detachBusinessLogoAsset(manager, businessId);
          business.logo = null;
        } else if (currentLogoAsset?.id !== newLogoAssetId) {
          await this.detachBusinessLogoAsset(manager, businessId, newLogoAssetId);

          const logoAsset = await this.getApprovedBusinessLogoAsset(
            manager,
            tenantCode,
            newLogoAssetId,
            actorUserId,
            businessId,
          );

          business.logo = this.s3Service.getObjectUrl(logoAsset.s3Key);

          await manager.getRepository(Asset).update(
            { id: logoAsset.id },
            {
              entityType: AssetEntityType.BUSINESS,
              entityId: businessId,
              attachedAt: new Date(),
            },
          );
        }
      }

      return manager.save(business);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: null,
      action: 'BUSINESS_UPDATED',
      description: `Business ${updated.name} updated`,
      metadata: {
        businessId: updated.id,
        fields: Object.keys(dto),
      },
    });

    return updated;
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
      businessId: null,
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
