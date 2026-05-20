import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';
import {
  Product,
  ProductCategory,
  ProductSubCategory,
} from '../entities/product.entity';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import {
  nextChildAccountCode,
  parseAccountCodeLevels,
  seedDefaultChartOfAccountsForBusiness,
} from './chart-of-account-bootstrap.helper';

async function resolveParentAccount(
  manager: EntityManager,
  businessId: string,
  parentCode: string,
): Promise<ChartOfAccount> {
  const parent = await manager.getRepository(ChartOfAccount).findOne({
    where: {
      businessId,
      code: parentCode,
      deletedAt: IsNull(),
    },
  });
  if (!parent) {
    throw new NotFoundException(
      `Parent chart of account "${parentCode}" not found. Seed default COA first.`,
    );
  }
  return parent;
}

async function createLinkedAccount(
  manager: EntityManager,
  params: {
    businessId: string;
    parentCode: string;
    name: string;
    isPostable: boolean;
    accountKind: ChartOfAccountKind;
    productCategoryId?: string | null;
    productSubCategoryId?: string | null;
    productId?: string | null;
  },
): Promise<ChartOfAccount> {
  await seedDefaultChartOfAccountsForBusiness(manager, params.businessId);
  await resolveParentAccount(manager, params.businessId, params.parentCode);

  const coaRepo = manager.getRepository(ChartOfAccount);
  const code = await nextChildAccountCode(
    coaRepo,
    params.businessId,
    params.parentCode,
  );
  const levels = parseAccountCodeLevels(code);

  return coaRepo.save(
    coaRepo.create({
      businessId: params.businessId,
      partyId: null,
      productCategoryId: params.productCategoryId ?? null,
      productSubCategoryId: params.productSubCategoryId ?? null,
      productId: params.productId ?? null,
      accountKind: params.accountKind,
      code,
      parentCode: params.parentCode,
      name: params.name,
      isPostable: params.isPostable,
      ...levels,
    }),
  );
}

/**
 * Ensures a non-postable inventory group account exists for a product category.
 */
export async function ensureChartOfAccountForCategory(
  manager: EntityManager,
  category: ProductCategory,
): Promise<ChartOfAccount> {
  const coaRepo = manager.getRepository(ChartOfAccount);
  const categoryRepo = manager.getRepository(ProductCategory);

  if (category.chartOfAccountId) {
    const existing = await coaRepo.findOne({
      where: {
        id: category.chartOfAccountId,
        businessId: category.businessId,
        deletedAt: IsNull(),
      },
    });
    if (existing) {
      return existing;
    }
  }

  const byLink = await coaRepo.findOne({
    where: {
      businessId: category.businessId,
      productCategoryId: category.id,
      accountKind: ChartOfAccountKind.PRODUCT_CATEGORY,
      deletedAt: IsNull(),
    },
  });
  if (byLink) {
    await categoryRepo.update(category.id, { chartOfAccountId: byLink.id });
    return byLink;
  }

  const account = await createLinkedAccount(manager, {
    businessId: category.businessId,
    parentCode: COA_PARENT_CODES.INVENTORY,
    name: category.name,
    isPostable: false,
    accountKind: ChartOfAccountKind.PRODUCT_CATEGORY,
    productCategoryId: category.id,
  });

  await categoryRepo.update(category.id, { chartOfAccountId: account.id });
  return account;
}

/**
 * Ensures a non-postable inventory group account exists for a product sub-category.
 */
export async function ensureChartOfAccountForSubCategory(
  manager: EntityManager,
  subCategory: ProductSubCategory,
  category?: ProductCategory,
): Promise<ChartOfAccount> {
  const coaRepo = manager.getRepository(ChartOfAccount);
  const subCategoryRepo = manager.getRepository(ProductSubCategory);
  const categoryRepo = manager.getRepository(ProductCategory);

  if (subCategory.chartOfAccountId) {
    const existing = await coaRepo.findOne({
      where: {
        id: subCategory.chartOfAccountId,
        businessId: subCategory.businessId,
        deletedAt: IsNull(),
      },
    });
    if (existing) {
      return existing;
    }
  }

  const byLink = await coaRepo.findOne({
    where: {
      businessId: subCategory.businessId,
      productSubCategoryId: subCategory.id,
      accountKind: ChartOfAccountKind.PRODUCT_SUB_CATEGORY,
      deletedAt: IsNull(),
    },
  });
  if (byLink) {
    await subCategoryRepo.update(subCategory.id, { chartOfAccountId: byLink.id });
    return byLink;
  }

  const resolvedCategory =
    category ??
    (await categoryRepo.findOne({
      where: { id: subCategory.categoryId, businessId: subCategory.businessId },
    }));
  if (!resolvedCategory) {
    throw new NotFoundException('Product category not found for sub-category COA');
  }

  const categoryAccount = await ensureChartOfAccountForCategory(
    manager,
    resolvedCategory,
  );

  const account = await createLinkedAccount(manager, {
    businessId: subCategory.businessId,
    parentCode: categoryAccount.code,
    name: subCategory.name,
    isPostable: false,
    accountKind: ChartOfAccountKind.PRODUCT_SUB_CATEGORY,
    productSubCategoryId: subCategory.id,
  });

  await subCategoryRepo.update(subCategory.id, { chartOfAccountId: account.id });
  return account;
}

/**
 * Creates a postable inventory leaf account for a product.
 */
export async function createChartOfAccountForProduct(
  manager: EntityManager,
  product: Product,
  subCategory?: ProductSubCategory,
): Promise<ChartOfAccount> {
  const coaRepo = manager.getRepository(ChartOfAccount);
  const productRepo = manager.getRepository(Product);
  const subCategoryRepo = manager.getRepository(ProductSubCategory);

  const existing = await coaRepo.findOne({
    where: {
      businessId: product.businessId,
      productId: product.id,
      accountKind: ChartOfAccountKind.PRODUCT_INVENTORY,
      deletedAt: IsNull(),
    },
  });
  if (existing) {
    await productRepo.update(product.id, { chartOfAccountId: existing.id });
    return existing;
  }

  const resolvedSubCategory =
    subCategory ??
    (await subCategoryRepo.findOne({
      where: { id: product.subCategoryId, businessId: product.businessId },
    }));
  if (!resolvedSubCategory) {
    throw new NotFoundException('Product sub-category not found for product COA');
  }

  const subCategoryAccount = await ensureChartOfAccountForSubCategory(
    manager,
    resolvedSubCategory,
  );

  const account = await createLinkedAccount(manager, {
    businessId: product.businessId,
    parentCode: subCategoryAccount.code,
    name: `${product.name} (${product.skuCode})`,
    isPostable: true,
    accountKind: ChartOfAccountKind.PRODUCT_INVENTORY,
    productId: product.id,
  });

  await productRepo.update(product.id, { chartOfAccountId: account.id });
  return account;
}
