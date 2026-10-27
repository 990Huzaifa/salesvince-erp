import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  DocumentTemplate,
  DocumentTemplateStatus,
} from 'src/master-db/entities/document-template.entity';
import { BusinessSettings } from 'src/tenant-db/entities/business-settings.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { UpdateBusinessSettingsDto } from '../dto/business-settings/update-business-settings.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class BusinessSettingsService {
  constructor(
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplateRepository: Repository<DocumentTemplate>,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async getOrCreateRow(
    tenantDb: DataSource,
    businessId: string,
  ): Promise<BusinessSettings> {
    const repo = tenantDb.getRepository(BusinessSettings);
    let row = await repo.findOne({
      where: { businessId },
      relations: ['defaultWarehouse', 'defaultVoucherPaymentCoa'],
    });

    if (!row) {
      row = await repo.save(
        repo.create({
          businessId,
          defaultPaymentMethod: null,
          defaultVoucherPaymentCoaId: null,
          defaultDocumentTemplateId: null,
          defaultWarehouseId: null,
          defaultCountryId: null,
          defaultStateId: null,
          defaultCityId: null,
          extras: null,
        }),
      );
      row = await repo.findOne({
        where: { id: row.id },
        relations: ['defaultWarehouse', 'defaultVoucherPaymentCoa'],
      });
    }

    return row!;
  }

  private async assertWarehouse(
    tenantDb: DataSource,
    businessId: string,
    warehouseId: string,
  ) {
    const warehouse = await tenantDb.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });
    if (!warehouse) {
      throw new BadRequestException('Default warehouse not found for this business');
    }
  }

  private async assertCoa(
    tenantDb: DataSource,
    businessId: string,
    coaId: string,
  ) {
    const coa = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: coaId, businessId, deletedAt: IsNull() },
    });
    if (!coa) {
      throw new BadRequestException(
        'Default voucher payment COA not found for this business',
      );
    }
  }

  private async assertDocumentTemplate(templateId: string) {
    const template = await this.documentTemplateRepository.findOne({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Document template not found');
    }
    if (template.status !== DocumentTemplateStatus.ACTIVE) {
      throw new BadRequestException(
        'Only ACTIVE document templates can be set as default',
      );
    }
  }

  async get(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const row = await this.getOrCreateRow(tenantDb, scopedBusinessId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'BUSINESS_SETTINGS_VIEW',
      description: 'Business settings fetched',
      metadata: { businessSettingsId: row.id },
    });

    return { data: row };
  }

  async update(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: UpdateBusinessSettingsDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const row = await this.getOrCreateRow(tenantDb, scopedBusinessId);

    if (dto.defaultPaymentMethod !== undefined) {
      row.defaultPaymentMethod = dto.defaultPaymentMethod;
    }

    if (dto.defaultVoucherPaymentCoaId !== undefined) {
      if (dto.defaultVoucherPaymentCoaId) {
        await this.assertCoa(
          tenantDb,
          scopedBusinessId,
          dto.defaultVoucherPaymentCoaId,
        );
      }
      row.defaultVoucherPaymentCoaId = dto.defaultVoucherPaymentCoaId;
    }

    if (dto.defaultDocumentTemplateId !== undefined) {
      if (dto.defaultDocumentTemplateId) {
        await this.assertDocumentTemplate(dto.defaultDocumentTemplateId);
      }
      row.defaultDocumentTemplateId = dto.defaultDocumentTemplateId;
    }

    if (dto.defaultWarehouseId !== undefined) {
      if (dto.defaultWarehouseId) {
        await this.assertWarehouse(
          tenantDb,
          scopedBusinessId,
          dto.defaultWarehouseId,
        );
      }
      row.defaultWarehouseId = dto.defaultWarehouseId;
    }

    if (dto.defaultCountryId !== undefined) {
      row.defaultCountryId = dto.defaultCountryId;
    }
    if (dto.defaultStateId !== undefined) {
      row.defaultStateId = dto.defaultStateId;
    }
    if (dto.defaultCityId !== undefined) {
      row.defaultCityId = dto.defaultCityId;
    }

    if (dto.extras !== undefined) {
      row.extras = dto.extras;
    }

    const saved = await tenantDb.getRepository(BusinessSettings).save(row);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'BUSINESS_SETTINGS_UPDATE',
      description: 'Business settings updated',
      metadata: {
        businessSettingsId: saved.id,
        fields: Object.keys(dto),
      },
    });

    const fresh = await tenantDb.getRepository(BusinessSettings).findOne({
      where: { id: saved.id },
      relations: ['defaultWarehouse', 'defaultVoucherPaymentCoa'],
    });

    return { data: fresh };
  }
}
