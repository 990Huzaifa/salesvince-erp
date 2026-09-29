import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
  AccountCodeLevels,
} from 'src/tenant-db/entities/chart-of-account.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
import { Employee } from 'src/tenant-db/entities/hr/employee.entity';
import { Transaction } from 'src/tenant-db/entities/transaction.entity';
import {
  BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG,
  resolveChartOfAccountTypeFromParent,
} from 'src/tenant-db/chart-of-accounts/constants/business-chart-of-account-type.config';
import { ChartOfAccountType } from 'src/tenant-db/chart-of-accounts/constants/chart-of-account-type.enum';
import {
  ensureDefaultChartOfAccountNodes,
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
} & AccountCodeLevels & {
  createdAt: Date;
  updatedAt: Date;
};

type CoaTreeAccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE'
  | 'UNKNOWN';

type CoaTreeUser = {
  id: string;
  name: string;
  email: string | null;
  code: string;
  profileType: string | null;
};

export type ChartOfAccountTreeNode = {
  id: string;
  code: string;
  name: string;
  label: string;
  accountType: CoaTreeAccountType;
  accountKind: ChartOfAccountKind;
  parentCode: string | null;
  parentName: string | null;
  balance: number;
  currentBalance: number;
  currency: string;
  depth: number;
  hasChildren: boolean;
  isPostable: boolean;
  userId: string | null;
  user: CoaTreeUser | null;
  createdAt: Date;
  updatedAt: Date;
  children?: ChartOfAccountTreeNode[];
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

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
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
      level6: account.level6,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private resolveTreeAccountType(level1: number): CoaTreeAccountType {
    switch (level1) {
      case 1:
        return 'ASSET';
      case 2:
        return 'LIABILITY';
      case 3:
        return 'EQUITY';
      case 4:
        return 'REVENUE';
      case 5:
        return 'EXPENSE';
      default:
        return 'UNKNOWN';
    }
  }

  private resolveDepth(code: string): number {
    return Math.max(code.split('-').length - 1, 0);
  }

  private compareAccountCodes(left: string, right: string): number {
    const leftParts = left.split('-').map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = right
      .split('-')
      .map((part) => Number.parseInt(part, 10) || 0);
    const max = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < max; index += 1) {
      const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return left.localeCompare(right);
  }

  private async loadLatestBalances(
    tenantDb: DataSource,
    businessId: string,
    accountIds: string[],
  ): Promise<Map<string, number>> {
    if (!accountIds.length) {
      return new Map();
    }

    const rows = await tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('tx')
      .distinctOn(['tx.chartOfAccountId'])
      .select('tx.chartOfAccountId', 'chartOfAccountId')
      .addSelect('tx.currentBalance', 'currentBalance')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.chartOfAccountId IN (:...accountIds)', { accountIds })
      .orderBy('tx.chartOfAccountId', 'ASC')
      .addOrderBy('tx.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .addOrderBy('tx.id', 'DESC')
      .getRawMany<{ chartOfAccountId: string; currentBalance: string }>();

    return new Map(
      rows.map((row) => [
        row.chartOfAccountId,
        this.roundAmount(Number(row.currentBalance ?? 0)),
      ]),
    );
  }

  private async loadEmployeeUsers(
    tenantDb: DataSource,
    businessId: string,
    employeeIds: string[],
  ): Promise<Map<string, CoaTreeUser>> {
    if (!employeeIds.length) {
      return new Map();
    }

    const employees = await tenantDb.getRepository(Employee).find({
      where: {
        businessId,
        id: In(employeeIds),
        deletedAt: IsNull(),
      },
      relations: { designation: true },
    });

    return new Map(
      employees.map((employee) => [
        employee.id,
        {
          id: employee.id,
          name: employee.fullName,
          email: employee.email,
          code: employee.employeeCode,
          profileType: employee.designation?.name ?? null,
        },
      ]),
    );
  }

  private buildAccountTree(
    accounts: ChartOfAccount[],
    balances: Map<string, number>,
    users: Map<string, CoaTreeUser>,
    currency: string,
  ): ChartOfAccountTreeNode[] {
    const byCode = new Map(accounts.map((account) => [account.code, account]));
    const childrenByParent = new Map<string | null, ChartOfAccount[]>();

    for (const account of accounts) {
      const key = account.parentCode;
      const siblings = childrenByParent.get(key) ?? [];
      siblings.push(account);
      childrenByParent.set(key, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((left, right) =>
        this.compareAccountCodes(left.code, right.code),
      );
    }

    const buildNode = (account: ChartOfAccount): ChartOfAccountTreeNode => {
      const childAccounts = childrenByParent.get(account.code) ?? [];
      const children = childAccounts.map((child) => buildNode(child));
      const ownBalance = balances.get(account.id) ?? 0;
      const rolledBalance = children.length
        ? this.roundAmount(
            children.reduce((sum, child) => sum + child.currentBalance, 0),
          )
        : ownBalance;

      const parent = account.parentCode
        ? byCode.get(account.parentCode)
        : undefined;
      const user =
        account.employeeId != null
          ? users.get(account.employeeId) ?? null
          : null;

      const node: ChartOfAccountTreeNode = {
        id: account.id,
        code: account.code,
        name: account.name,
        label: `${account.code} ${account.name}`,
        accountType: this.resolveTreeAccountType(account.level1),
        accountKind: account.accountKind,
        parentCode: account.parentCode,
        parentName: parent?.name ?? null,
        balance: rolledBalance,
        currentBalance: rolledBalance,
        currency,
        depth: this.resolveDepth(account.code),
        hasChildren: children.length > 0,
        isPostable: account.isPostable,
        userId: account.employeeId ?? null,
        user,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };

      if (children.length > 0) {
        node.children = children;
      }

      return node;
    };

    const roots = childrenByParent.get(null) ?? [];
    return roots.map((account) => buildNode(account));
  }

  private filterTreeBySearch(
    nodes: ChartOfAccountTreeNode[],
    search: string,
  ): ChartOfAccountTreeNode[] {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return nodes;
    }

    const filterNode = (
      node: ChartOfAccountTreeNode,
    ): ChartOfAccountTreeNode | null => {
      const selfMatch =
        node.name.toLowerCase().includes(needle) ||
        node.code.toLowerCase().includes(needle) ||
        node.label.toLowerCase().includes(needle);

      const filteredChildren = (node.children ?? [])
        .map((child) => filterNode(child))
        .filter((child): child is ChartOfAccountTreeNode => child != null);

      if (!selfMatch && filteredChildren.length === 0) {
        return null;
      }

      const next: ChartOfAccountTreeNode = {
        ...node,
        hasChildren: filteredChildren.length > 0,
      };
      if (filteredChildren.length > 0) {
        next.children = filteredChildren;
      } else {
        delete next.children;
      }
      return next;
    };

    return nodes
      .map((node) => filterNode(node))
      .filter((node): node is ChartOfAccountTreeNode => node != null);
  }

  private countTreeNodes(nodes: ChartOfAccountTreeNode[]): number {
    let total = 0;
    const walk = (items: ChartOfAccountTreeNode[]) => {
      for (const item of items) {
        total += 1;
        if (item.children?.length) {
          walk(item.children);
        }
      }
    };
    walk(nodes);
    return total;
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

    await ensureDefaultChartOfAccountNodes(tenantDb, scopedBusinessId);

    const qb = tenantDb
      .getRepository(ChartOfAccount)
      .createQueryBuilder('coa')
      .where('coa.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('coa.deletedAt IS NULL')
      .orderBy('coa.code', 'ASC');

    if (options.type) {
      const config = BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG[options.type];
      if (!config) {
        throw new BadRequestException('Invalid chart of account type');
      }
      qb.andWhere(
        `(coa.parentCode = :parentCode OR coa.code = :parentCode OR coa.code LIKE :parentPrefix OR :parentCode LIKE coa.code || '-%')`,
        {
          parentCode: config.parentCode,
          parentPrefix: `${config.parentCode}-%`,
        },
      );
    }

    const accounts = await qb.getMany();

    const business = await tenantDb.getRepository(Business).findOne({
      where: { id: scopedBusinessId, deletedAt: IsNull() },
      select: ['id', 'currency'],
    });
    const currency = business?.currency?.trim() || 'PKR';

    const balances = await this.loadLatestBalances(
      tenantDb,
      scopedBusinessId,
      accounts.map((account) => account.id),
    );

    const employeeIds = [
      ...new Set(
        accounts
          .map((account) => account.employeeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = await this.loadEmployeeUsers(
      tenantDb,
      scopedBusinessId,
      employeeIds,
    );

    let tree = this.buildAccountTree(accounts, balances, users, currency);
    if (options.search?.trim()) {
      tree = this.filterTreeBySearch(tree, options.search);
    }

    const totalAccounts = this.countTreeNodes(tree);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CHART_OF_ACCOUNT_LISTED',
      description: 'Chart of accounts tree listed',
      metadata: {
        businessId: scopedBusinessId,
        totalRoots: tree.length,
        totalAccounts,
      },
    });

    return {
      view: 'tree' as const,
      data: tree,
      meta: {
        totalRoots: tree.length,
        totalAccounts,
      },
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
      const duplicateName = await tenantDb
        .getRepository(ChartOfAccount)
        .findOne({
          where: {
            businessId: scopedBusinessId,
            parentCode: account.parentCode,
            name,
            accountKind: ChartOfAccountKind.BUSINESS,
            deletedAt: IsNull(),
          },
          select: ['id'],
        });
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
