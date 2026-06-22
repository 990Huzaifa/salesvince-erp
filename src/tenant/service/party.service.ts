import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
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
import { MasterGeoHelperService } from './master-geo-helper.service';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

@Injectable()
export class PartyService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly transactionService: TransactionService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async attachGeoNames<T extends { countryId?: string | null; stateId?: string | null; cityId?: string | null }>(
    data: T,
  ): Promise<T & { countryName: string | null; stateName: string | null; cityName: string | null }> {
    const [countryName, stateName, cityName] = await Promise.all([
      this.masterGeoHelperService.getCountryNameById(data.countryId),
      this.masterGeoHelperService.getStateNameById(data.stateId),
      this.masterGeoHelperService.getCityNameById(data.cityId),
    ]);

    return {
      ...data,
      countryName,
      stateName,
      cityName,
    };
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

  private async mapParty(party: Party) {
    const partyWithGeoNames = await this.attachGeoNames(party);
    return {
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
      id: party.id,
      businessId: party.businessId,
      code: party.code,
      name: party.name,
      email: party.email,
      phone: party.phone,
      type: party.type,
      partyClass: party.partyClass,
      creditLimit: party.creditLimit,
      payableOpeningBalance: party.payableOpeningBalance,
      receivableOpeningBalance: party.receivableOpeningBalance,
      whatsAppNumber: party.whatsAppNumber,
      alternatePhone: party.alternatePhone,
      ntnNumber: party.ntnNumber,
      strnNumber: party.strnNumber,
      cnic: party.cnic,
      countryId: party.countryId,
      stateId: party.stateId,
      cityId: party.cityId,
      countryName: partyWithGeoNames.countryName,
      stateName: partyWithGeoNames.stateName,
      cityName: partyWithGeoNames.cityName,
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
      cityId?: string | null;
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
      .leftJoinAndSelect('p.payableAccount', 'pa');

      if(options.type === PartyType.CUSTOMER) {
        qb.where('p.businessId = :businessId', { businessId: scopedBusinessId });
      }
      qb.andWhere('p.deletedAt IS NULL')
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (options.search?.trim()) { // search by name, code, email, phone, whatsAppNumber, alternatePhone, ntnNumber, strnNumber, cnic, taxNumber, address, countryName, stateName, cityName
      qb.andWhere(
        '(p.name ILIKE :search OR p.code ILIKE :search OR p.email ILIKE :search)',
        { search: `%${options.search.trim()}%` },
      );
    }

    if (options.cityId) {
      qb.andWhere('p.cityId = :cityId', { cityId: options.cityId });
    }

    if (options.type) {
      qb.andWhere('p.type IN (:...types)', { types: [options.type,'BOTH'] });
    }

    const [parties, total] = await qb.getManyAndCount();
    const data = await Promise.all(parties.map((party) => this.mapParty(party)));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PARTY_LISTED',
      description: 'Parties listed',
      metadata: { businessId: scopedBusinessId, count: parties.length },
    });

    return {
      data,
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
      businessId: scopedBusinessId,
      action: 'PARTY_VIEWED',
      description: `Party ${party.code} viewed`,
      metadata: { businessId: scopedBusinessId, partyId: party.id },
    });

    return { data: await this.mapParty(party) };
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
      businessId: scopedBusinessId,
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

    return { data: await this.mapParty(saved!) };
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
      businessId: scopedBusinessId,
      action: 'PARTY_UPDATED',
      description: `Party ${saved.code} updated`,
      metadata: { businessId: scopedBusinessId, partyId: saved.id },
    });

    return { data: await this.mapParty(withAccounts!) };
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
      businessId: scopedBusinessId,
      action: 'PARTY_DELETED',
      description: `Party ${party.code} deleted`,
      metadata: { businessId: scopedBusinessId, partyId: party.id },
    });

    return { message: 'Party deleted successfully' };
  }

  private sanitizePartyImportText(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value ?? '').trim();
    }
    return value.trim();
  }

  private parsePartyImportNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizePartyImportHeaderKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, '');
  }

  private getPartyImportRowValue(
    row: Record<string, unknown>,
    ...keys: string[]
  ): unknown {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(this.normalizePartyImportHeaderKey(key), value);
    }
    for (const key of keys) {
      const value = normalizedRow.get(this.normalizePartyImportHeaderKey(key));
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private parsePartyClassValue(value: unknown): PartyClass | undefined {
    const normalized = this.sanitizePartyImportText(value).toUpperCase();
    if (!normalized) {
      return undefined;
    }
    if (Object.values(PartyClass).includes(normalized as PartyClass)) {
      return normalized as PartyClass;
    }
    return undefined;
  }

  private toPartyGeoId(value: unknown): string | undefined {
    const text = this.sanitizePartyImportText(value);
    return text || undefined;
  }

  private parsePartyRowsFromFile(
    file: Express.Multer.File,
    type: PartyType,
  ): Array<{
    row: number;
    name: string;
    phone?: string;
    address?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
    partyClass?: PartyClass;
    receivableOpeningBalance?: number;
    payableOpeningBalance?: number;
  }> {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const rows: Array<{
      row: number;
      name: string;
      phone?: string;
      address?: string;
      countryId?: string;
      stateId?: string;
      cityId?: string;
      partyClass?: PartyClass;
      receivableOpeningBalance?: number;
      payableOpeningBalance?: number;
    }> = [];

    rawRows.forEach((row, index) => {
      const name = this.sanitizePartyImportText(this.getPartyImportRowValue(row, 'name'));
      if (!name || name.toLowerCase() === 'name') {
        return;
      }

      const phone = this.sanitizePartyImportText(this.getPartyImportRowValue(row, 'phone'));
      const address = this.sanitizePartyImportText(this.getPartyImportRowValue(row, 'address'));
      const countryId = this.toPartyGeoId(this.getPartyImportRowValue(row, 'countryId', 'countryid'));
      const stateId = this.toPartyGeoId(this.getPartyImportRowValue(row, 'stateId', 'stateid'));
      const cityId = this.toPartyGeoId(this.getPartyImportRowValue(row, 'cityId', 'cityid'));
      const partyClass = this.parsePartyClassValue(
        this.getPartyImportRowValue(row, 'class', 'partyClass', 'partyclass'),
      );

      const receivableOpeningBalance =
        this.parsePartyImportNumber(
          this.getPartyImportRowValue(
            row,
            'receivableOpeningBalance',
            'receivableopeningbalance',
          ),
        ) ?? 0;
      const payableOpeningBalance =
        this.parsePartyImportNumber(
          this.getPartyImportRowValue(row, 'payableOpeningBalance', 'payableopeningbalance'),
        ) ?? 0;

      rows.push({
        row: index + 2,
        name,
        phone: phone || undefined,
        address: address || undefined,
        countryId,
        stateId,
        cityId,
        partyClass: type === PartyType.CUSTOMER ? partyClass : undefined,
        receivableOpeningBalance:
          type === PartyType.CUSTOMER ? receivableOpeningBalance : undefined,
        payableOpeningBalance:
          type === PartyType.VENDOR ? payableOpeningBalance : undefined,
      });
    });

    return rows;
  }

  private getPartyImportDuplicateTypes(type: PartyType): PartyType[] {
    return type === PartyType.CUSTOMER
      ? [PartyType.CUSTOMER, PartyType.BOTH]
      : [PartyType.VENDOR, PartyType.BOTH];
  }

  private async notifyPartyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    partyType: PartyType,
    status: 'completed' | 'failed',
  ) {
    const label = partyType === PartyType.CUSTOMER ? 'Customer' : 'Vendor';
    const title =
      status === 'completed' ? `${label} import completed` : `${label} import failed`;
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        businessId: user.businessId,
        message,
        type: partyType === PartyType.CUSTOMER ? 'party_customer_import' : 'party_vendor_import',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
      },
    );
  }

  private async processPartyImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: Array<{
      row: number;
      name: string;
      phone?: string;
      address?: string;
      countryId?: string;
      stateId?: string;
      cityId?: string;
      partyClass?: PartyClass;
      receivableOpeningBalance?: number;
      payableOpeningBalance?: number;
    }>,
    user: { userId: string; businessId: string },
    tenantCode: string,
    partyType: PartyType,
  ) {
    this.tenantJobService.startJob(jobId);
    const partyRepo = tenantDb.getRepository(Party);
    const duplicateTypes = this.getPartyImportDuplicateTypes(partyType);

    for (const row of rows) {
      try {
        const existing = await partyRepo.findOne({
          where: {
            businessId: user.businessId,
            name: row.name,
            type: In(duplicateTypes),
            deletedAt: IsNull(),
          },
          select: ['id'],
        });
        if (existing) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const dto: CreatePartyDto = {
          name: row.name,
          type: partyType,
          phone: row.phone,
          address: row.address,
          countryId: row.countryId,
          stateId: row.stateId,
          cityId: row.cityId,
          partyClass: row.partyClass,
          receivableOpeningBalance: row.receivableOpeningBalance,
          payableOpeningBalance: row.payableOpeningBalance,
        };

        const created = await this.createParty(
          tenantDb,
          user.businessId,
          dto,
          user.userId,
        );

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: { partyId: created.data.id, code: created.data.code },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `${partyType === PartyType.CUSTOMER ? 'Customer' : 'Vendor'} import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        partyType,
      },
    });

    await this.notifyPartyImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      partyType,
      'completed',
    );
  }

  async importParties(
    tenantDb: DataSource,
    file: Express.Multer.File,
    type: PartyType,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (type !== PartyType.CUSTOMER && type !== PartyType.VENDOR) {
      throw new BadRequestException('type must be CUSTOMER or VENDOR');
    }

    const rows = this.parsePartyRowsFromFile(file, type);
    if (!rows.length) {
      throw new BadRequestException('No party rows found in file');
    }

    const jobType =
      type === PartyType.CUSTOMER ? 'PARTY_CUSTOMER_IMPORT' : 'PARTY_VENDOR_IMPORT';

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType,
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `${type === PartyType.CUSTOMER ? 'Customer' : 'Vendor'} import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
        partyType: type,
      },
    });

    void this.processPartyImportJob(
      tenantDb,
      job.id,
      rows,
      user,
      tenantCode,
      type,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing failure',
      });
      const failedJob = this.tenantJobService.getJobById(job.id, tenantCode, user.userId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_FAILED',
        description: `${type === PartyType.CUSTOMER ? 'Customer' : 'Vendor'} import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
          partyType: type,
        },
      });
      await this.notifyPartyImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        type,
        'failed',
      );
    });

    return {
      message: `${type === PartyType.CUSTOMER ? 'Customer' : 'Vendor'} import started`,
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
      type,
    };
  }
}
