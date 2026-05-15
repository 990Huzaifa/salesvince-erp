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
  parseAccountCodeLevels,
  seedDefaultChartOfAccountsForBusiness,
} from 'src/tenant-db/helpers/chart-of-account-bootstrap.helper';
import { CreateChartOfAccountDto } from '../dto/chart-of-account/create-chart-of-account.dto';
import { UpdateChartOfAccountDto } from '../dto/chart-of-account/update-chart-of-account.dto';
import { ActivityLogService } from './activity-log.service';

export type ChartOfAccountTreeNode = ChartOfAccount & {
  children: ChartOfAccountTreeNode[];
};

@Injectable()
export class ChartOfAccountService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private mapAccount(account: ChartOfAccount) {
    return {
      id: account.id,
      businessId: account.businessId,
      partyId: account.partyId,
      accountKind: account.accountKind,
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

  private buildTree(accounts: ChartOfAccount[]): ChartOfAccountTreeNode[] {
    const nodes = new Map<string, ChartOfAccountTreeNode>();
    for (const account of accounts) {
      nodes.set(account.code, { ...account, children: [] });
    }

    const roots: ChartOfAccountTreeNode[] = [];
    for (const account of accounts) {
      const node = nodes.get(account.code)!;
      if (account.parentCode && nodes.has(account.parentCode)) {
        nodes.get(account.parentCode)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async findAccountForBusiness(
    tenantDb: DataSource,
    businessId: string,
    accountId: string,
  ): Promise<ChartOfAccount> {
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }
    return account;
  }

  private async assertParentExists(
    tenantDb: DataSource,
    businessId: string,
    parentCode: string,
  ): Promise<ChartOfAccount> {
    const parent = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { businessId, code: parentCode, deletedAt: IsNull() },
    });
    if (!parent) {
      throw new NotFoundException('Parent account not found');
    }
    return parent;
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
      parentCode?: string;
      postableOnly?: boolean;
      asTree?: boolean;
      partyId?: string;
      accountKind?: ChartOfAccountKind;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const qb = tenantDb
      .getRepository(ChartOfAccount)
      .createQueryBuilder('coa')
      .where('coa.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('coa.deletedAt IS NULL')
      .orderBy('coa.code', 'ASC');

    if (options.search?.trim()) {
      qb.andWhere(
        '(coa.name ILIKE :search OR coa.code ILIKE :search)',
        { search: `%${options.search.trim()}%` },
      );
    }

    if (options.parentCode !== undefined) {
      if (options.parentCode === '' || options.parentCode === null) {
        qb.andWhere('coa.parentCode IS NULL');
      } else {
        qb.andWhere('coa.parentCode = :parentCode', {
          parentCode: options.parentCode,
        });
      }
    }

    if (options.postableOnly) {
      qb.andWhere('coa.isPostable = true');
    }

    if (options.partyId) {
      qb.andWhere('coa.partyId = :partyId', { partyId: options.partyId });
    }

    if (options.accountKind) {
      qb.andWhere('coa.accountKind = :accountKind', {
        accountKind: options.accountKind,
      });
    }

    const accounts = await qb.getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'CHART_OF_ACCOUNT_LISTED',
      description: 'Chart of accounts listed',
      metadata: { businessId: scopedBusinessId, count: accounts.length },
    });

    const data = options.asTree
      ? this.buildTree(accounts)
      : accounts.map((a) => this.mapAccount(a));

    return { data };
  }

  async getAccountById(
    tenantDb: DataSource,
    businessId: string | undefined,
    accountId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const account = await this.findAccountForBusiness(
      tenantDb,
      scopedBusinessId,
      accountId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'CHART_OF_ACCOUNT_VIEWED',
      description: `Chart of account ${account.code} viewed`,
      metadata: { businessId: scopedBusinessId, accountId: account.id },
    });

    return { data: this.mapAccount(account) };
  }

  async createAccount(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateChartOfAccountDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const code = dto.code.trim();
    const name = dto.name.trim();
    const parentCode = dto.parentCode?.trim() || null;

    const coaRepo = tenantDb.getRepository(ChartOfAccount);

    const existing = await coaRepo.findOne({
      where: { businessId: scopedBusinessId, code, deletedAt: IsNull() },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('Account code already exists for this business');
    }

    if (parentCode) {
      await this.assertParentExists(tenantDb, scopedBusinessId, parentCode);
    }

    const levels = parseAccountCodeLevels(code);
    const saved = await coaRepo.save(
      coaRepo.create({
        businessId: scopedBusinessId,
        code,
        parentCode,
        name,
        isPostable: dto.isPostable ?? true,
        accountKind: ChartOfAccountKind.SYSTEM,
        partyId: null,
        ...levels,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'CHART_OF_ACCOUNT_CREATED',
      description: `Chart of account ${code} created`,
      metadata: { businessId: scopedBusinessId, accountId: saved.id, code },
    });

    return { data: this.mapAccount(saved) };
  }

  async updateAccount(
    tenantDb: DataSource,
    businessId: string | undefined,
    accountId: string,
    dto: UpdateChartOfAccountDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const account = await this.findAccountForBusiness(
      tenantDb,
      scopedBusinessId,
      accountId,
    );
    const coaRepo = tenantDb.getRepository(ChartOfAccount);

    if (dto.name !== undefined) {
      account.name = dto.name.trim();
    }

    if (dto.isPostable !== undefined) {
      account.isPostable = dto.isPostable;
    }

    if (dto.parentCode !== undefined) {
      const parentCode =
        dto.parentCode === null || dto.parentCode === ''
          ? null
          : dto.parentCode.trim();

      if (parentCode === account.code) {
        throw new BadRequestException('Account cannot be its own parent');
      }

      if (parentCode) {
        await this.assertParentExists(tenantDb, scopedBusinessId, parentCode);
        const childCount = await coaRepo.count({
          where: {
            businessId: scopedBusinessId,
            parentCode: account.code,
            deletedAt: IsNull(),
          },
        });
        if (childCount > 0 && parentCode !== account.parentCode) {
          throw new ConflictException(
            'Cannot change parent while account has child accounts',
          );
        }
      }

      account.parentCode = parentCode;
    }

    const saved = await coaRepo.save(account);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'CHART_OF_ACCOUNT_UPDATED',
      description: `Chart of account ${saved.code} updated`,
      metadata: { businessId: scopedBusinessId, accountId: saved.id },
    });

    return { data: this.mapAccount(saved) };
  }

  async deleteAccount(
    tenantDb: DataSource,
    businessId: string | undefined,
    accountId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const account = await this.findAccountForBusiness(
      tenantDb,
      scopedBusinessId,
      accountId,
    );

    const childCount = await tenantDb.getRepository(ChartOfAccount).count({
      where: {
        businessId: scopedBusinessId,
        parentCode: account.code,
        deletedAt: IsNull(),
      },
    });
    if (childCount > 0) {
      throw new ConflictException(
        'Cannot delete account that has child accounts',
      );
    }

    account.deletedAt = new Date();
    await tenantDb.getRepository(ChartOfAccount).save(account);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      action: 'CHART_OF_ACCOUNT_DELETED',
      description: `Chart of account ${account.code} deleted`,
      metadata: { businessId: scopedBusinessId, accountId: account.id },
    });

    return { message: 'Chart of account deleted successfully' };
  }
}
