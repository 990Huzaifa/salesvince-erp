import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import { ensureDefaultChartOfAccountNodes } from './chart-of-account-bootstrap.helper';

/**
 * Ensures default COA nodes exist (and sync postable flags), then returns
 * the system account for the given code.
 */
export async function resolveSystemPostableAccountByCode(
  manager: EntityManager,
  businessId: string,
  code: string,
  label: string,
): Promise<ChartOfAccount> {
  await ensureDefaultChartOfAccountNodes(manager, businessId);

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
): Promise<ChartOfAccount> {
  return resolveSystemPostableAccountByCode(
    manager,
    businessId,
    COA_PARENT_CODES.SALES_REVENUE,
    'Sales Revenue',
  );
}

export async function resolveCogsAccount(
  manager: EntityManager,
  businessId: string,
): Promise<ChartOfAccount> {
  return resolveSystemPostableAccountByCode(
    manager,
    businessId,
    COA_PARENT_CODES.COST_OF_GOODS_SOLD,
    'Cost of Goods Sold',
  );
}

export async function resolveInventoryControlAccount(
  manager: EntityManager,
  businessId: string,
): Promise<ChartOfAccount> {
  return resolveSystemPostableAccountByCode(
    manager,
    businessId,
    COA_PARENT_CODES.INVENTORY,
    'Inventory',
  );
}
