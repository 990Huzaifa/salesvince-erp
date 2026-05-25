import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Flavour, Product, ProductBrand, ProductCategory, ProductSubCategory, Uom } from 'src/tenant-db/entities/product.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { ChartOfAccount, ChartOfAccountKind } from 'src/tenant-db/entities/chart-of-account.entity';
import { COA_PARENT_CODES } from 'src/tenant-db/chart-of-accounts/constants/coa-parent-codes';
import { Transaction } from 'src/tenant-db/entities/transaction.entity';

@Injectable()
export class TenantUtilityService {

  async getRoles(tenantDb: DataSource) {
  const roles = await tenantDb.getRepository(Role).find({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
    },
    order: { name: 'ASC' },
  });
  // remove permissions array from roles
  return { result: roles };
  }

  async getPermissions(tenantDb: DataSource) {
    const permissions = await tenantDb.getRepository(Permission).find({
      select: ['id', 'key', 'name'],
      order: { name: 'ASC' },
    });

    return { result: permissions };
  }

  async getProductCategories(tenantDb: DataSource, businessId: string) {
    const productCategories = await tenantDb.getRepository(ProductCategory).find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productCategories };
  }

  async getProductSubCategories(tenantDb: DataSource, businessId: string) {
    const productSubCategories = await tenantDb.getRepository(ProductSubCategory).find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productSubCategories };
  }

  async getProductBrands(tenantDb: DataSource, businessId: string) {
    const productBrands = await tenantDb.getRepository(ProductBrand).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productBrands };
  }

  async getProductList(tenantDb: DataSource, businessId: string) {
    const productList = await tenantDb.getRepository(Product).find({
      select: {
        id: true,
        name: true,
        skuCode: true,
      },
      relations: {
        pricing: {
          uom: true,
        },
        flavours: true,
      },
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productList };
  }

  async getFlavours(tenantDb: DataSource, businessId: string) {
    const flavours = await tenantDb.getRepository(Flavour).find({
      select: ['id', 'name'],
      where: { businessId: businessId },
      order: { name: 'ASC' },
    });

    return { result: flavours };
  }

  async uoms(tenantDb: DataSource, businessId: string) {
    const uoms = await tenantDb.getRepository(Uom).find({
      select: ['id', 'name', 'isBase'],
      where: { isBase: false, businessId: businessId },
      order: { name: 'ASC' },
    });

    return { result: uoms };
  }

  async warehouses(tenantDb: DataSource, businessId: string) {
    const warehouses = await tenantDb.getRepository(Warehouse).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: warehouses };
  }

  async getAccountTypes(tenantDb: DataSource) {
    const accountTypes = [
      { parentCode: COA_PARENT_CODES.INVENTORY, label: 'Inventory' },
      { parentCode: COA_PARENT_CODES.CUSTOMER_RECEIVABLES, label: 'Customer Receivables' },
      { parentCode: COA_PARENT_CODES.VENDOR_PAYABLES, label: 'Vendor Payables' },
      { parentCode: COA_PARENT_CODES.BUSINESS_EXPENSE, label: 'Business Expense' },
      { parentCode: COA_PARENT_CODES.BUSINESS_INCOME, label: 'Business Income' },
      { parentCode: COA_PARENT_CODES.OWNER_CAPITAL, label: 'Owner Capital' },
      { parentCode: COA_PARENT_CODES.SALARIES_PAYABLE, label: 'Salaries Payable' },
      { parentCode: COA_PARENT_CODES.TAX_PAYABLE, label: 'Tax Payable' },
      { parentCode: COA_PARENT_CODES.SHORT_TERM_LOAN_PAYABLE, label: 'Short-Term Loan Payable' },
      { parentCode: COA_PARENT_CODES.LONG_TERM_LOAN_PAYABLE, label: 'Long-Term Loan Payable' },
    ];
    return { result: accountTypes };
  }

  async getAccountList(tenantDb: DataSource, parentCode: string, businessId: string) {
    const accountList = await tenantDb.getRepository(ChartOfAccount).find({
      select: ['id', 'name', 'code', 'parentCode', 'isPostable'],
      where: { deletedAt: null, parentCode: parentCode, isPostable: true, businessId: businessId },
      order: { name: 'ASC' },
    });

    const accountIds = accountList.map((account) => account.id);
    if (accountIds.length === 0) {
      return { result: [] };
    }

    const latestBalances = await tenantDb
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
      .getRawMany<{ chartOfAccountId: string; currentBalance: string | number | null }>();

    const balanceByAccountId = new Map(
      latestBalances.map((balance) => [
        balance.chartOfAccountId,
        Number(balance.currentBalance ?? 0),
      ]),
    );

    return {
      result: accountList.map((account) => ({
        ...account,
        currentBalance: balanceByAccountId.get(account.id) ?? 0,
      })),
    };
  }

}
