import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import { ensureDefaultChartOfAccountNodes } from './chart-of-account-bootstrap.helper';

type ResolveOptions = {
  /** When true, caller already ran ensureDefaultChartOfAccountNodes. */
  skipEnsure?: boolean;
};

/**
 * Ensures default COA nodes exist (and sync postable flags), then returns
 * the system account for the given code.
 */
export async function resolveSystemPostableAccountByCode(
  manager: EntityManager,
  businessId: string,
  code: string,
  label: string,
  options?: ResolveOptions,
): Promise<ChartOfAccount> {
  if (!options?.skipEnsure) {
    await ensureDefaultChartOfAccountNodes(manager, businessId);
  }

  const account = await manager.getRepository(ChartOfAccount).findOne({
    where: {
      businessId,
      code,
      deletedAt: IsNull(),
    },
  });

  if (!account) {
    throw new NotFoundException(
      `${label} account (${code}) not found. Seed default COA first.`,
    );
  }

  if (!account.isPostable) {
    throw new BadRequestException(
      `${label} account (${code}) is not postable`,
    );
  }

  return account;
}

export async function resolveSalesRevenueAccount(
  manager: EntityManager,
  businessId: string,
  options?: ResolveOptions,
): Promise<ChartOfAccount> {
  return resolveSystemPostableAccountByCode(
    manager,
    businessId,
    COA_PARENT_CODES.SALES_REVENUE,
    'Sales Revenue',
    options,
  );
}

export async function resolveCogsAccount(
  manager: EntityManager,
  businessId: string,
  options?: ResolveOptions,
): Promise<ChartOfAccount> {
  return resolveSystemPostableAccountByCode(
    manager,
    businessId,
    COA_PARENT_CODES.COST_OF_GOODS_SOLD,
    'Cost of Goods Sold',
    options,
  );
}

export async function resolveInventoryControlAccount(
  manager: EntityManager,
  businessId: string,
  options?: ResolveOptions,
): Promise<ChartOfAccount> {
  return resolveSystemPostableAccountByCode(
    manager,
    businessId,
    COA_PARENT_CODES.INVENTORY,
    'Inventory',
    options,
  );
}

/**
 * Ensures default COA once, then resolves sales / COGS / inventory in parallel.
 */
export async function resolveSaleLedgerSystemAccounts(
  manager: EntityManager,
  businessId: string,
): Promise<{
  salesRevenue: ChartOfAccount;
  cogs: ChartOfAccount;
  inventory: ChartOfAccount;
}> {
  await ensureDefaultChartOfAccountNodes(manager, businessId);
  const skipEnsure = { skipEnsure: true } as const;
  const [salesRevenue, cogs, inventory] = await Promise.all([
    resolveSalesRevenueAccount(manager, businessId, skipEnsure),
    resolveCogsAccount(manager, businessId, skipEnsure),
    resolveInventoryControlAccount(manager, businessId, skipEnsure),
  ]);
  return { salesRevenue, cogs, inventory };
}
