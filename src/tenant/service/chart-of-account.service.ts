import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from 'src/tenant-db/entities/chart-of-account.entity';
import {
  BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG,
  resolveChartOfAccountTypeFromParent,
} from 'src/tenant-db/chart-of-accounts/constants/business-chart-of-account-type.config';
import { ChartOfAccountType } from 'src/tenant-db/chart-of-accounts/constants/chart-of-account-type.enum';
import {
  nextChildAccountCode,
  parseAccountCodeLevels,
  seedDefaultChartOfAccountsForBusiness,
} from 'src/tenant-db/helpers/chart-of-account-bootstrap.helper';
import { CreateChartOfAccountDto } from '../dto/chart-of-account/create-chart-of-account.dto';
import { RenameChartOfAccountDto } from '../dto/chart-of-account/rename-chart-of-account.dto';
import { ActivityLogService } from './activity-log.service';
import { TransactionService } from './transaction.service';

export type ChartOfAccountListItem = {
  id: string;
  businessId: string;
  accountKind: ChartOfAccountKind;
  accountType: ChartOfAccountType | null;
  code: string;
  parentCode: string | null;
  name: string;
  isPostable: boolean;
  level1: number;
  level2: number;
  level3: number;
  level4: number;
  level5: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ChartOfAccountService {
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

  private mapBusinessAccount(account: ChartOfAccount): ChartOfAccountListItem {
    return {
      id: account.id,
      businessId: account.businessId,
      accountKind: account.accountKind,
      accountType: resolveChartOfAccountTypeFromParent(account.parentCode),
      code: account.code,
      parentCode: account.parentCode,
      name: account.name,
      isPostable: account.isPostable,
      level1: account.level1,
      level2: account.level2,
      level3: account.level3,
      level4: account.level4,
      level5: account.level5,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private async findBusinessAccountForBusiness(
    tenantDb: DataSource,
    businessId: string,
    accountId: string,
  ): Promise<ChartOfAccount> {
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: {
        id: accountId,
        businessId,
        accountKind: ChartOfAccountKind.BUSINESS,
        deletedAt: IsNull(),
      },
    });
    if (!account) {
      throw new NotFoundException('Business chart of account not found');
    }
    return account;
  }

  listAccountTypes() {
    const data = Object.entries(BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG).map(
      ([type, config]) => ({
        type: type as ChartOfAccountType,
        parentCode: config.parentCode,
        label: config.label,
      }),
    );
    return { data };
  }

  async seedForBusiness(
    tenantDb: DataSource,
    businessId: string,
  ): Promise<ChartOfAccount[]> {
    return seedDefaultChartOfAccountsForBusiness(tenantDb, businessId);
  }

  async listAccounts(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      search?: string;
      type?: ChartOfAccountType;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const qb = tenantDb
      .getRepository(ChartOfAccount)
      .createQueryBuilder('coa')
      .where('coa.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('coa.accountKind = :accountKind', {
        accountKind: ChartOfAccountKind.BUSINESS,
      })
      .andWhere('coa.deletedAt IS NULL')
      .orderBy('coa.code', 'ASC');

    if (options.search?.trim()) {
      qb.andWhere(
        '(coa.name ILIKE :search OR coa.code ILIKE :search)',
        { search: `%${options.search.trim()}%` },
      );
    }

    if (options.type) {
      const config = BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG[options.type];
      if (!config) {
        throw new BadRequestException('Invalid chart of account type');
      }
      qb.andWhere('coa.parentCode = :parentCode', {
        parentCode: config.parentCode,
      });
    }

    const accounts = await qb.getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CHART_OF_ACCOUNT_LISTED',
      description: 'Business chart of accounts listed',
      metadata: { businessId: scopedBusinessId, count: accounts.length },
    });

    return {
      data: accounts.map((account) => this.mapBusinessAccount(account)),
    };
  }

  async createAccount(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateChartOfAccountDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const typeConfig = BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG[dto.type];
    if (!typeConfig) {
      throw new BadRequestException('Invalid chart of account type');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Account name is required');
    }

    await seedDefaultChartOfAccountsForBusiness(tenantDb, scopedBusinessId);

    const coaRepo = tenantDb.getRepository(ChartOfAccount);
    const parent = await coaRepo.findOne({
      where: {
        businessId: scopedBusinessId,
        code: typeConfig.parentCode,
        deletedAt: IsNull(),
      },
    });
    if (!parent) {
      throw new NotFoundException(
        `Parent chart of account "${typeConfig.parentCode}" not found for type ${dto.type}`,
      );
    }

    const duplicateName = await coaRepo.findOne({
      where: {
        businessId: scopedBusinessId,
        parentCode: typeConfig.parentCode,
        name,
        accountKind: ChartOfAccountKind.BUSINESS,
        deletedAt: IsNull(),
      },
      select: ['id'],
    });
    if (duplicateName) {
      throw new ConflictException(
        'An account with this name already exists under the selected type',
      );
    }

    let openingBalanceTransactionId: string | null = null;

    const saved = await tenantDb.transaction(async (manager) => {
      const code = await nextChildAccountCode(
        manager.getRepository(ChartOfAccount),
        scopedBusinessId,
        typeConfig.parentCode,
      );
      const levels = parseAccountCodeLevels(code);

      const account = await manager.save(
        manager.create(ChartOfAccount, {
          businessId: scopedBusinessId,
          code,
          parentCode: typeConfig.parentCode,
          name,
          isPostable: true,
          accountKind: ChartOfAccountKind.BUSINESS,
          partyId: null,
          ...levels,
        }),
      );

      const openingTransaction =
        await this.transactionService.postBusinessAccountOpeningBalance(
          manager,
          {
            businessId: scopedBusinessId,
            account,
            openingBalance: dto.openingBalance,
          },
        );
      openingBalanceTransactionId = openingTransaction?.id ?? null;

      return account;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CHART_OF_ACCOUNT_CREATED',
      description: `Business chart of account ${saved.code} (${dto.type}) created`,
      metadata: {
        businessId: scopedBusinessId,
        accountId: saved.id,
        code: saved.code,
        type: dto.type,
        openingBalance: dto.openingBalance ?? 0,
        openingBalanceTransactionId,
      },
    });

    return {
      data: this.mapBusinessAccount(saved),
      openingBalanceTransactionId,
    };
  }

  async renameAccount(
    tenantDb: DataSource,
    businessId: string | undefined,
    accountId: string,
    dto: RenameChartOfAccountDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const account = await this.findBusinessAccountForBusiness(
      tenantDb,
      scopedBusinessId,
      accountId,
    );

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Account name is required');
    }

    if (name !== account.name && account.parentCode) {
      const duplicateName = await tenantDb.getRepository(ChartOfAccount).findOne(
        {
          where: {
            businessId: scopedBusinessId,
            parentCode: account.parentCode,
            name,
            accountKind: ChartOfAccountKind.BUSINESS,
            deletedAt: IsNull(),
          },
          select: ['id'],
        },
      );
      if (duplicateName && duplicateName.id !== account.id) {
        throw new ConflictException(
          'An account with this name already exists under the same type',
        );
      }
    }

    account.name = name;
    const saved = await tenantDb.getRepository(ChartOfAccount).save(account);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CHART_OF_ACCOUNT_RENAMED',
      description: `Business chart of account ${saved.code} renamed`,
      metadata: { businessId: scopedBusinessId, accountId: saved.id },
    });

    return { data: this.mapBusinessAccount(saved) };
  }
}
