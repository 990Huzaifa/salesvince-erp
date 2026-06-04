import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
  AccountCodeLevels,
} from '../entities/chart-of-account.entity';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../chart-of-accounts/constants/default-chart-of-accounts';

type TenantDb = DataSource | EntityManager;

export async function nextChildAccountCode(
  coaRepo: Repository<ChartOfAccount>,
  businessId: string,
  parentCode: string,
): Promise<string> {
  const prefix = `${parentCode}-`;
  const siblings = await coaRepo
    .createQueryBuilder('coa')
    .select(['coa.code'])
    .where('coa.businessId = :businessId', { businessId })
    .andWhere('coa.parentCode = :parentCode', { parentCode })
    .andWhere('coa.deletedAt IS NULL')
    .getMany();

  let maxSuffix = 0;
  for (const row of siblings) {
    if (!row.code.startsWith(prefix)) {
      continue;
    }
    const suffix = row.code.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > maxSuffix) {
      maxSuffix = num;
    }
  }

  return `${prefix}${maxSuffix + 1}`;
}

export function parseAccountCodeLevels(code: string): AccountCodeLevels {
  const parts = code.split('-').map((p) => parseInt(p, 10) || 0);
  return {
    level1: parts[0] ?? 0,
    level2: parts[1] ?? 0,
    level3: parts[2] ?? 0,
    level4: parts[3] ?? 0,
    level5: parts[4] ?? 0,
    level6: parts[5] ?? 0,
  };
}

/**
 * Inserts the default chart of accounts for a business (idempotent per business + code).
 */
export async function seedDefaultChartOfAccountsForBusiness(
  tenantDb: TenantDb,
  businessId: string,
): Promise<ChartOfAccount[]> {
  const coaRepo = tenantDb.getRepository(ChartOfAccount);

  const existing = await coaRepo.count({
    where: { businessId, deletedAt: IsNull() },
  });
  if (existing > 0) {
    return coaRepo.find({
      where: { businessId, deletedAt: IsNull() },
      order: { code: 'ASC' },
    });
  }

  const rows = DEFAULT_CHART_OF_ACCOUNTS.map((item) => {
    const levels = parseAccountCodeLevels(item.code);
    return coaRepo.create({
      businessId,
      code: item.code,
      parentCode: item.parentCode,
      name: item.name,
      isPostable: item.isPostable,
      accountKind: ChartOfAccountKind.SYSTEM,
      partyId: null,
      employeeId: null,
      ...levels,
    });
  });

  return coaRepo.save(rows);
}

/**
 * Inserts any default COA nodes missing for a business (e.g. after chart template updates).
 */
export async function ensureDefaultChartOfAccountNodes(
  tenantDb: TenantDb,
  businessId: string,
): Promise<void> {
  const coaRepo = tenantDb.getRepository(ChartOfAccount);

  for (const item of DEFAULT_CHART_OF_ACCOUNTS) {
    const exists = await coaRepo.findOne({
      where: { businessId, code: item.code, deletedAt: IsNull() },
      select: ['id'],
    });
    if (exists) {
      continue;
    }

    const levels = parseAccountCodeLevels(item.code);
    await coaRepo.save(
      coaRepo.create({
        businessId,
        code: item.code,
        parentCode: item.parentCode,
        name: item.name,
        isPostable: item.isPostable,
        accountKind: ChartOfAccountKind.SYSTEM,
        partyId: null,
        employeeId: null,
        ...levels,
      }),
    );
  }
}
