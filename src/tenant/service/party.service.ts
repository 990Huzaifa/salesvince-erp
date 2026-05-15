import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Party, PartyClass, PartyType } from 'src/tenant-db/entities/party.entity';
import { seedDefaultChartOfAccountsForBusiness } from 'src/tenant-db/helpers/chart-of-account-bootstrap.helper';
import {
  createChartOfAccountsForParty,
  softDeletePartyChartOfAccounts,
} from 'src/tenant-db/helpers/party-chart-of-account.helper';
import { CreatePartyDto } from '../dto/party/create-party.dto';
import { UpdatePartyDto } from '../dto/party/update-party.dto';
import { ActivityLogService } from './activity-log.service';
import { TransactionService } from './transaction.service';

@Injectable()
export class PartyService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly transactionService: TransactionService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private isCustomerParty(type: PartyType): boolean {
    return type === PartyType.CUSTOMER || type === PartyType.BOTH;
  }

  private assertCustomerOnlyFields(
    type: PartyType,
    fields: { partyClass?: PartyClass; creditLimit?: number },
  ): void {
    if (this.isCustomerParty(type)) {
      return;
    }
    if (fields.partyClass !== undefined || fields.creditLimit !== undefined) {
      throw new BadRequestException(
        'partyClass and creditLimit are only allowed for CUSTOMER or BOTH parties',
      );
    }
  }

  private assertOpeningBalanceByType(
    type: PartyType,
    payableOpeningBalance?: number,
    receivableOpeningBalance?: number,
  ): void {
    const payable = payableOpeningBalance ?? 0;
    const receivable = receivableOpeningBalance ?? 0;

    if (type === PartyType.CUSTOMER && payable !== 0) {
      throw new BadRequestException(
        'payableOpeningBalance is not allowed for CUSTOMER parties',
      );
    }
    if (type === PartyType.VENDOR && receivable !== 0) {
      throw new BadRequestException(
        'receivableOpeningBalance is not allowed for VENDOR parties',
      );
    }
  }

  private resolveCustomerFields(
    type: PartyType,
    partyClass?: PartyClass,
    creditLimit?: number,
  ): { partyClass: PartyClass | null; creditLimit: number | null } {
    if (!this.isCustomerParty(type)) {
      return { partyClass: null, creditLimit: null };
    }
    return {
      partyClass: partyClass ?? null,
      creditLimit: creditLimit ?? null,
    };
  }

  private mapParty(party: Party) {
    return {
      id: party.id,
      businessId: party.businessId,
      code: party.code,
      name: party.name,
      type: party.type,
      partyClass: party.partyClass,
      creditLimit:
        party.creditLimit != null ? Number(party.creditLimit) : null,
      payableOpeningBalance: Number(party.payableOpeningBalance ?? 0),
      receivableOpeningBalance: Number(party.receivableOpeningBalance ?? 0),
      receivableAccountId: party.receivableAccountId,
      payableAccountId: party.payableAccountId,
      receivableAccount: party.receivableAccount
        ? {
            id: party.receivableAccount.id,
            code: party.receivableAccount.code,
            name: party.receivableAccount.name,
          }
        : null,
      payableAccount: party.payableAccount
        ? {
            id: party.payableAccount.id,
            code: party.payableAccount.code,
            name: party.payableAccount.name,
          }
        : null,
      email: party.email,
      phone: party.phone,
      whatsAppNumber: party.whatsAppNumber,
      alternatePhone: party.alternatePhone,
      ntnNumber: party.ntnNumber,
      strnNumber: party.strnNumber,
      cnic: party.cnic,
      taxNumber: party.taxNumber,
      address: party.address,
      createdAt: party.createdAt,
      updatedAt: party.updatedAt,
    };
  }

  private async findPartyForBusiness(
    tenantDb: DataSource,
    businessId: string,
    partyId: string,
    withAccounts = false,
  ): Promise<Party> {
    const party = await tenantDb.getRepository(Party).findOne({
      where: { id: partyId, businessId, deletedAt: IsNull() },
      relations: withAccounts
        ? { receivableAccount: true, payableAccount: true }
        : undefined,
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
    return party;
  }

  private async generatePartyCode(
    tenantDb: DataSource,
    businessId: string,
    type: PartyType,
  ): Promise<string> {
    const prefix =
      type === PartyType.VENDOR
        ? 'VEN'
        : type === PartyType.CUSTOMER
          ? 'CUS'
          : 'PTY';

    const last = await tenantDb
      .getRepository(Party)
      .createQueryBuilder('p')
      .where('p.businessId = :businessId', { businessId })
      .andWhere('p.code LIKE :prefix', { prefix: `${prefix}-%` })
      .andWhere('p.deletedAt IS NULL')
      .orderBy('p.code', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.code.replace(`${prefix}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${prefix}-${String(next).padStart(5, '0')}`;
  }

  async listParties(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      type?: PartyType;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(Party)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.receivableAccount', 'ra')
      .leftJoinAndSelect('p.payableAccount', 'pa')
      .where('p.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('p.deletedAt IS NULL')
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (options.search?.trim()) {
      qb.andWhere(
        '(p.name ILIKE :search OR p.code ILIKE :search OR p.email ILIKE :search)',
        { search: `%${options.search.trim()}%` },
      );
    }

    if (options.type) {
      qb.andWhere('p.type = :type', { type: options.type });
    }

    const [parties, total] = await qb.getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'PARTY_LISTED',
      description: 'Parties listed',
      metadata: { businessId: scopedBusinessId, count: parties.length },
    });

    return {
      data: parties.map((p) => this.mapParty(p)),
      meta: { total, page, limit },
    };
  }

  async getPartyById(
    tenantDb: DataSource,
    businessId: string | undefined,
    partyId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const party = await this.findPartyForBusiness(
      tenantDb,
      scopedBusinessId,
      partyId,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'PARTY_VIEWED',
      description: `Party ${party.code} viewed`,
      metadata: { businessId: scopedBusinessId, partyId: party.id },
    });

    return { data: this.mapParty(party) };
  }

  async createParty(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePartyDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const name = dto.name.trim();
    const code =
      dto.code?.trim() ||
      (await this.generatePartyCode(tenantDb, scopedBusinessId, dto.type));

    const partyRepo = tenantDb.getRepository(Party);
    const existing = await partyRepo.findOne({
      where: { businessId: scopedBusinessId, code, deletedAt: IsNull() },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('Party code already exists for this business');
    }

    this.assertCustomerOnlyFields(dto.type, {
      partyClass: dto.partyClass,
      creditLimit: dto.creditLimit,
    });

    const customerFields = this.resolveCustomerFields(
      dto.type,
      dto.partyClass,
      dto.creditLimit,
    );

    this.assertOpeningBalanceByType(
      dto.type,
      dto.payableOpeningBalance,
      dto.receivableOpeningBalance,
    );

    await seedDefaultChartOfAccountsForBusiness(tenantDb, scopedBusinessId);

    let openingBalanceTransactionCount = 0;

    const saved = await tenantDb.transaction(async (manager) => {
      let party = await manager.save(
        manager.create(Party, {
          businessId: scopedBusinessId,
          code,
          name,
          type: dto.type,
          partyClass: customerFields.partyClass,
          creditLimit: customerFields.creditLimit,
          payableOpeningBalance: dto.payableOpeningBalance ?? 0,
          receivableOpeningBalance: dto.receivableOpeningBalance ?? 0,
          email: dto.email?.trim().toLowerCase() ?? null,
          phone: dto.phone?.trim() ?? null,
          whatsAppNumber: dto.whatsAppNumber?.trim() ?? null,
          alternatePhone: dto.alternatePhone?.trim() ?? null,
          ntnNumber: dto.ntnNumber?.trim() ?? null,
          strnNumber: dto.strnNumber?.trim() ?? null,
          cnic: dto.cnic?.trim() ?? null,
          countryId: dto.countryId?.trim() ?? null,
          stateId: dto.stateId?.trim() ?? null,
          cityId: dto.cityId?.trim() ?? null,
          taxNumber: dto.taxNumber?.trim() ?? null,
          address: dto.address?.trim() ?? null,
        }),
      );

      const { receivableAccount, payableAccount } =
        await createChartOfAccountsForParty(manager, party);

      party.receivableAccountId = receivableAccount?.id ?? null;
      party.payableAccountId = payableAccount?.id ?? null;
      party = await manager.save(party);

      const openingTransactions =
        await this.transactionService.postPartyOpeningBalances(manager, {
          businessId: scopedBusinessId,
          party,
          receivableOpeningBalance: dto.receivableOpeningBalance ?? 0,
          payableOpeningBalance: dto.payableOpeningBalance ?? 0,
        });
      openingBalanceTransactionCount = openingTransactions.length;

      return manager.findOne(Party, {
        where: { id: party.id },
        relations: { receivableAccount: true, payableAccount: true },
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'PARTY_CREATED',
      description: `Party ${code} created`,
      metadata: {
        businessId: scopedBusinessId,
        partyId: saved!.id,
        receivableAccountId: saved!.receivableAccountId,
        payableAccountId: saved!.payableAccountId,
        openingBalanceTransactionCount,
      },
    });

    return { data: this.mapParty(saved!) };
  }

  async updateParty(
    tenantDb: DataSource,
    businessId: string | undefined,
    partyId: string,
    dto: UpdatePartyDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const party = await this.findPartyForBusiness(
      tenantDb,
      scopedBusinessId,
      partyId,
    );

    this.assertCustomerOnlyFields(party.type, {
      partyClass: dto.partyClass,
      creditLimit: dto.creditLimit,
    });

    if (dto.name !== undefined) party.name = dto.name.trim();

    if (this.isCustomerParty(party.type)) {
      if (dto.partyClass !== undefined) {
        party.partyClass = dto.partyClass;
      }
      if (dto.creditLimit !== undefined) {
        party.creditLimit = dto.creditLimit;
      }
    }
    if (dto.email !== undefined)
      party.email = dto.email?.trim().toLowerCase() ?? null;
    if (dto.phone !== undefined) party.phone = dto.phone?.trim() ?? null;
    if (dto.whatsAppNumber !== undefined)
      party.whatsAppNumber = dto.whatsAppNumber?.trim() ?? null;
    if (dto.alternatePhone !== undefined)
      party.alternatePhone = dto.alternatePhone?.trim() ?? null;
    if (dto.ntnNumber !== undefined)
      party.ntnNumber = dto.ntnNumber?.trim() ?? null;
    if (dto.strnNumber !== undefined)
      party.strnNumber = dto.strnNumber?.trim() ?? null;
    if (dto.cnic !== undefined) party.cnic = dto.cnic?.trim() ?? null;
    if (dto.taxNumber !== undefined)
      party.taxNumber = dto.taxNumber?.trim() ?? null;
    if (dto.address !== undefined)
      party.address = dto.address?.trim() ?? null;
    if (dto.countryId !== undefined)
      party.countryId = dto.countryId?.trim() ?? null;
    if (dto.stateId !== undefined)
      party.stateId = dto.stateId?.trim() ?? null;
    if (dto.cityId !== undefined)
      party.cityId = dto.cityId?.trim() ?? null;

    const saved = await tenantDb.getRepository(Party).save(party);

    const withAccounts = await tenantDb.getRepository(Party).findOne({
      where: { id: saved.id },
      relations: { receivableAccount: true, payableAccount: true },
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'PARTY_UPDATED',
      description: `Party ${saved.code} updated`,
      metadata: { businessId: scopedBusinessId, partyId: saved.id },
    });

    return { data: this.mapParty(withAccounts!) };
  }

  async deleteParty(
    tenantDb: DataSource,
    businessId: string | undefined,
    partyId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const party = await this.findPartyForBusiness(
      tenantDb,
      scopedBusinessId,
      partyId,
    );

    await tenantDb.transaction(async (manager) => {
      await softDeletePartyChartOfAccounts(manager, party.id);
      party.deletedAt = new Date();
      await manager.save(party);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'PARTY_DELETED',
      description: `Party ${party.code} deleted`,
      metadata: { businessId: scopedBusinessId, partyId: party.id },
    });

    return { message: 'Party deleted successfully' };
  }
}
