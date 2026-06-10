import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Flavour, Product, ProductBrand, ProductCategory, ProductSubCategory, Uom } from 'src/tenant-db/entities/product.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { ChartOfAccount, ChartOfAccountKind } from 'src/tenant-db/entities/chart-of-account.entity';
import { COA_PARENT_CODES } from 'src/tenant-db/chart-of-accounts/constants/coa-parent-codes';
import { Transaction } from 'src/tenant-db/entities/transaction.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import { PartyType } from 'src/tenant-db/entities/party.entity';
import { Batch, StockBalance } from 'src/tenant-db/entities/stock.entity';
import { selectStockPricing } from '../utils/stock-batch.util';
import { SaleOrder, OrderStatus as SaleOrderStatus } from 'src/tenant-db/entities/sale-order.entity';
import { PurchaseOrder } from 'src/tenant-db/entities/purchase-order.entity';
import { Grn } from 'src/tenant-db/entities/grn.entity';
import { DeliveryNote } from 'src/tenant-db/entities/delivery-note.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { Loan, LoanStatus } from 'src/tenant-db/entities/loan.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
import { ChartOfAccountType } from 'src/tenant-db/chart-of-accounts/constants/chart-of-account-type.enum';
import {
  Department,
  Designation,
  Employee,
  PayPolicy,
  Payslip,
  SalaryComponent,
} from 'src/tenant-db/entities/hr';
import { SalaryVoucher } from 'src/tenant-db/entities/salary-voucher.entity';
import {
  ComponentTypeEnum,
  EmployeeStatusEnum,
  EmploymentTypeEnum,
  GenderEnum,
  MaritalStatusEnum,
  OvertimeRateTypeEnum,
  PayCycleEnum,
  PayslipStatusEnum,
  PayrollTypeEnum,
  SalaryCalculationTypeEnum,
  SalaryPaymentMethodEnum,
  SalaryStructureStatusEnum,
  WorkingDaysTypeEnum,
  ComponentCalculationTypeEnum,
} from 'src/tenant-db/entities/hr/hr.enums';

@Injectable()
export class TenantUtilityService {
  private productUomKey(productId: string, uomId: string): string {
    return `${productId}:${uomId}`;
  }

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

  async getBusinesses(tenantDb: DataSource) {
    const businesses = await tenantDb.getRepository(Business).find({
      select: ['id', 'name', 'code', 'legalName', 'currency', 'status'],
      where: { deletedAt: null },
      order: { name: 'ASC' },
    });

    return { result: businesses };
  }

  async getProductCategories(tenantDb: DataSource, businessId: string) {
    const productCategories = await tenantDb.getRepository(ProductCategory).find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productCategories };
  }

  async getProductSubCategories(tenantDb: DataSource, businessId: string, categoryId?: string) {
    const where: { businessId: string; categoryId?: string } = { businessId };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const productSubCategories = await tenantDb.getRepository(ProductSubCategory).find({
      select: ['id', 'name', 'slug', 'categoryId'],
      order: { name: 'ASC' },
      where,
    });

    return { result: productSubCategories };
  }

  async getApprovedSaleOrders(tenantDb: DataSource, businessId: string) {
    const orders = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('saleOrder')
      .leftJoin('saleOrder.customer', 'customer')
      .select('saleOrder.id', 'id')
      .addSelect('saleOrder.orderNumber', 'orderNumber')
      .addSelect('saleOrder.orderDate', 'orderDate')
      .addSelect('saleOrder.orderStatus', 'orderStatus')
      .addSelect('saleOrder.totalAmount', 'totalAmount')
      .addSelect('saleOrder.customerId', 'customerId')
      .addSelect('customer.name', 'customerName')
      .addSelect('customer.code', 'customerCode')
      .where('saleOrder.businessId = :businessId', { businessId })
      .andWhere('saleOrder.orderStatus = :orderStatus', {
        orderStatus: SaleOrderStatus.APPROVED,
      })
      .orderBy('saleOrder.orderDate', 'DESC')
      .addOrderBy('saleOrder.createdAt', 'DESC')
      .getRawMany();

    return { result: orders };
  }

  async getSaleOrders(tenantDb: DataSource, businessId: string) {
    const orders = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('saleOrder')
      .leftJoin('saleOrder.customer', 'customer')
      .select('saleOrder.id', 'id')
      .addSelect('saleOrder.orderNumber', 'orderNumber')
      .addSelect('saleOrder.orderDate', 'orderDate')
      .addSelect('saleOrder.orderStatus', 'orderStatus')
      .addSelect('saleOrder.totalAmount', 'totalAmount')
      .addSelect('saleOrder.customerId', 'customerId')
      .addSelect('customer.name', 'customerName')
      .addSelect('customer.code', 'customerCode')
      .where('saleOrder.businessId = :businessId', { businessId })
      .andWhere((qb) => {
        const usedInDeliveryNoteSubQuery = qb
          .subQuery()
          .select('1')
          .from(DeliveryNote, 'deliveryNote')
          .where('deliveryNote.saleOrderId = saleOrder.id')
          .andWhere('deliveryNote.businessId = :businessId')
          .getQuery();

        return `NOT EXISTS ${usedInDeliveryNoteSubQuery}`;
      })
      .orderBy('saleOrder.orderDate', 'DESC')
      .addOrderBy('saleOrder.createdAt', 'DESC')
      .getRawMany();

    return { result: orders };
  }

  async getPurchaseOrders(tenantDb: DataSource, businessId: string) {
    const orders = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('purchaseOrder')
      .leftJoin('purchaseOrder.vendor', 'vendor')
      .leftJoin('purchaseOrder.warehouse', 'warehouse')
      .select('purchaseOrder.id', 'id')
      .addSelect('purchaseOrder.orderNumber', 'orderNumber')
      .addSelect('purchaseOrder.orderDate', 'orderDate')
      .addSelect('purchaseOrder.orderStatus', 'orderStatus')
      .addSelect('purchaseOrder.totalAmount', 'totalAmount')
      .addSelect('purchaseOrder.vendorId', 'vendorId')
      .addSelect('vendor.name', 'vendorName')
      .addSelect('vendor.code', 'vendorCode')
      .addSelect('purchaseOrder.warehouseId', 'warehouseId')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('warehouse.code', 'warehouseCode')
      .where('purchaseOrder.businessId = :businessId', { businessId })
      .andWhere((qb) => {
        const usedInGrnSubQuery = qb
          .subQuery()
          .select('1')
          .from(Grn, 'grn')
          .where('grn.purchaseOrderId = purchaseOrder.id')
          .andWhere('grn.businessId = :businessId')
          .andWhere('grn.deletedAt IS NULL')
          .getQuery();

        return `NOT EXISTS ${usedInGrnSubQuery}`;
      })
      .orderBy('purchaseOrder.orderDate', 'DESC')
      .addOrderBy('purchaseOrder.createdAt', 'DESC')
      .getRawMany();

    return { result: orders };
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

  async getStockProducts(
    tenantDb: DataSource,
    businessId: string,
    warehouseId?: string,
  ) {
    const balanceQb = tenantDb
      .getRepository(StockBalance)
      .createQueryBuilder('balance')
      .innerJoinAndSelect('balance.product', 'product')
      .innerJoin('balance.warehouse', 'warehouse')
      .leftJoinAndSelect('balance.uom', 'uom')
      .where('balance.businessId = :businessId', { businessId })
      .andWhere('balance.deletedAt IS NULL')
      .andWhere('balance.quantityAvailable > 0')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('warehouse.deletedAt IS NULL');

    if (warehouseId) {
      balanceQb.andWhere('balance.warehouseId = :warehouseId', { warehouseId });
    }

    const stockBalances = await balanceQb
      .orderBy('product.name', 'ASC')
      .addOrderBy('uom.name', 'ASC')
      .getMany();

    const batchQb = tenantDb
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .where('batch.businessId = :businessId', { businessId })
      .andWhere('batch.deletedAt IS NULL')
      .andWhere('batch.quantity > 0');

    if (warehouseId) {
      batchQb.andWhere('batch.warehouseId = :warehouseId', { warehouseId });
    }

    const batches = await batchQb.getMany();

    const batchesByProductUom = new Map<string, Batch[]>();
    for (const batch of batches) {
      const key = this.productUomKey(batch.productId, batch.uomId);
      const rows = batchesByProductUom.get(key) ?? [];
      rows.push(batch);
      batchesByProductUom.set(key, rows);
    }

    type AggregatedStock = {
      productId: string;
      name: string;
      skuCode: string;
      batchPickStrategy: Product['batchPickStrategy'];
      uomId: string;
      uom: { id: string; name: string } | null;
      quantityAvailable: number;
      quantityOnHand: number;
    };

    const aggregated = new Map<string, AggregatedStock>();

    for (const balance of stockBalances) {
      const key = this.productUomKey(balance.productId, balance.uomId);
      const existing = aggregated.get(key);

      if (existing) {
        existing.quantityAvailable += Number(balance.quantityAvailable);
        existing.quantityOnHand += Number(balance.quantityOnHand);
        continue;
      }

      aggregated.set(key, {
        productId: balance.productId,
        name: balance.product.name,
        skuCode: balance.product.skuCode,
        batchPickStrategy: balance.product.batchPickStrategy,
        uomId: balance.uomId,
        uom: balance.uom
          ? {
              id: balance.uom.id,
              name: balance.uom.name,
            }
          : null,
        quantityAvailable: Number(balance.quantityAvailable),
        quantityOnHand: Number(balance.quantityOnHand),
      });
    }

    return {
      result: [...aggregated.values()].map((row) => {
        const productBatches =
          batchesByProductUom.get(this.productUomKey(row.productId, row.uomId)) ??
          [];
        const pricing = selectStockPricing(row.batchPickStrategy, productBatches);

        return {
          id: row.productId,
          name: row.name,
          skuCode: row.skuCode,
          batchPickStrategy: row.batchPickStrategy,
          uomId: row.uomId,
          uom: row.uom,
          quantityAvailable: row.quantityAvailable,
          quantityOnHand: row.quantityOnHand,
          purchaseUnitPrice: pricing.purchaseUnitPrice,
          saleUnitPrice: pricing.saleUnitPrice,
          selectedBatch: pricing.selectedBatch,
        };
      }),
    };
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

  async getWarehouseList(tenantDb: DataSource, businessId: string) {
    const warehouses = await tenantDb.getRepository(Warehouse).find({
      select: ['id', 'name', 'code'],
      order: { name: 'ASC' },
      where: { businessId: businessId, deletedAt: IsNull() },
    });

    return { result: warehouses };
  }

  async getAccountTypes(tenantDb: DataSource) {
    const accountTypes = [
      { parentCode: COA_PARENT_CODES.INVENTORY, label: 'Inventory', type: ChartOfAccountType.INVENTORY },
      { parentCode: COA_PARENT_CODES.CASH, label: 'Cash', type: ChartOfAccountType.CASH },
      { parentCode: COA_PARENT_CODES.BANK, label: 'Bank', type: ChartOfAccountType.BANK },
      { parentCode: COA_PARENT_CODES.BUSINESS_EXPENSE, label: 'Business Expense', type: ChartOfAccountType.BUSINESS_EXPENSE },
      { parentCode: COA_PARENT_CODES.BUSINESS_INCOME, label: 'Business Income', type: ChartOfAccountType.BUSINESS_INCOME },
      { parentCode: COA_PARENT_CODES.OWNER_CAPITAL, label: 'Owner Capital', type: ChartOfAccountType.OWNER_CAPITAL },
      { parentCode: COA_PARENT_CODES.SALARIES_PAYABLE, label: 'Salaries Payable', type: ChartOfAccountType.SALARIES_PAYABLE },
      { parentCode: COA_PARENT_CODES.TAX_PAYABLE, label: 'Tax Payable', type: ChartOfAccountType.TAX_PAYABLE },
      { parentCode: COA_PARENT_CODES.SHORT_TERM_LOAN_PAYABLE, label: 'Short-Term Loan Payable', type: ChartOfAccountType.SHORT_TERM_LOAN_PAYABLE },
      { parentCode: COA_PARENT_CODES.LONG_TERM_LOAN_PAYABLE, label: 'Long-Term Loan Payable', type: ChartOfAccountType.LONG_TERM_LOAN_PAYABLE },
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

  async getVendors(tenantDb: DataSource, businessId: string) {
    // party type will be vendor or both
    const vendors = await tenantDb.getRepository(Party).find({
      select: ['id', 'name', 'code','payableAccountId'],
      where: { businessId: businessId, type: In([PartyType.VENDOR, PartyType.BOTH]), deletedAt: null },
      order: { name: 'ASC' },
    });

    return { result: vendors };
  }

  async getCustomers(tenantDb: DataSource, businessId: string) {
    // party type will be customer or both
    const customers = await tenantDb.getRepository(Party).find({
      select: ['id', 'name', 'code','receivableAccountId'],
      where: { businessId: businessId, type: In([PartyType.CUSTOMER, PartyType.BOTH]), deletedAt: null },
      order: { name: 'ASC' },
    });

    return { result: customers };
  }

  async getSaleInvoices(tenantDb: DataSource, businessId: string) {
    const invoices = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .select('invoice.id', 'id')
      .addSelect('invoice.invoiceNumber', 'code')
      .addSelect('invoice.totalAmount', 'totalAmount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .orderBy('invoice.invoiceDate', 'DESC')
      .addOrderBy('invoice.createdAt', 'DESC')
      .getRawMany();

    return { result: invoices };
  }

  getHrEnums() {
    return {
      gender: Object.values(GenderEnum),
      maritalStatus: Object.values(MaritalStatusEnum),
      employmentType: Object.values(EmploymentTypeEnum),
      employeeStatus: Object.values(EmployeeStatusEnum),
      salaryPaymentMethod: Object.values(SalaryPaymentMethodEnum),
      payrollType: Object.values(PayrollTypeEnum),
      payCycle: Object.values(PayCycleEnum),
      salaryCalculationType: Object.values(SalaryCalculationTypeEnum),
      workingDaysType: Object.values(WorkingDaysTypeEnum),
      overtimeRateType: Object.values(OvertimeRateTypeEnum),
      componentType: Object.values(ComponentTypeEnum),
      componentCalculationType: Object.values(ComponentCalculationTypeEnum),
      salaryStructureStatus: Object.values(SalaryStructureStatusEnum),
    };
  }

  async getDepartments(tenantDb: DataSource, businessId: string) {
    const rows = await tenantDb.getRepository(Department).find({
      where: { businessId, deletedAt: IsNull() },
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getDesignations(tenantDb: DataSource, businessId: string) {
    const rows = await tenantDb.getRepository(Designation).find({
      where: { businessId, deletedAt: IsNull() },
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getEmployees(tenantDb: DataSource, businessId: string) {
    const rows = await tenantDb.getRepository(Employee).find({
      where: {
        businessId,
        employeeStatus: EmployeeStatusEnum.ACTIVE,
        deletedAt: IsNull(),
      },
      select: ['id', 'fullName', 'employeeCode', 'departmentId', 'designationId'],
      order: { fullName: 'ASC' },
    });
    return { result: rows };
  }

  async getPayPolicies(tenantDb: DataSource, businessId: string) {
    const rows = await tenantDb.getRepository(PayPolicy).find({
      where: { businessId, isActive: true, deletedAt: IsNull() },
      select: ['id', 'name', 'code', 'isDefault', 'currency'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getSalaryComponents(
    tenantDb: DataSource,
    businessId: string,
    componentType?: ComponentTypeEnum,
  ) {
    const where: {
      businessId: string;
      isActive: boolean;
      deletedAt: ReturnType<typeof IsNull>;
      componentType?: ComponentTypeEnum;
    } = {
      businessId,
      isActive: true,
      deletedAt: IsNull(),
    };
    if (componentType) {
      where.componentType = componentType;
    }

    const rows = await tenantDb.getRepository(SalaryComponent).find({
      where,
      select: ['id', 'name', 'code', 'componentType', 'calculationType'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getPurchaseInvoices(tenantDb: DataSource, businessId: string) {
    const invoices = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .select('invoice.id', 'id')
      .addSelect('invoice.invoiceNumber', 'code')
      .addSelect('invoice.totalAmount', 'totalAmount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .orderBy('invoice.invoiceDate', 'DESC')
      .addOrderBy('invoice.createdAt', 'DESC')
      .getRawMany();

    return { result: invoices };
  }

  async getAllUtilityData(tenantDb: DataSource, businessId: string) {
    const accountTypes = await this.getAccountTypes(tenantDb);
    const accountListEntries = await Promise.all(
      accountTypes.result.map(async ({ parentCode }) => [
        parentCode,
        (await this.getAccountList(tenantDb, parentCode, businessId)).result,
      ] as const),
    );

    const [
      roles,
      permissions,
      businesses,
      productCategories,
      productSubCategories,
      approvedSaleOrders,
      purchaseOrders,
      saleOrders,
      productBrands,
      flavours,
      uoms,
      warehouseList,
      productList,
      stockProducts,
      vendors,
      customers,
      saleInvoices,
      purchaseInvoices,
      departments,
      designations,
      employees,
      payPolicies,
      salaryComponents,
      loans,
    ] = await Promise.all([
      this.getRoles(tenantDb),
      this.getPermissions(tenantDb),
      this.getBusinesses(tenantDb),
      this.getProductCategories(tenantDb, businessId),
      this.getProductSubCategories(tenantDb, businessId),
      this.getApprovedSaleOrders(tenantDb, businessId),
      this.getPurchaseOrders(tenantDb, businessId),
      this.getSaleOrders(tenantDb, businessId),
      this.getProductBrands(tenantDb, businessId),
      this.getFlavours(tenantDb, businessId),
      this.uoms(tenantDb, businessId),
      this.getWarehouseList(tenantDb, businessId),
      this.getProductList(tenantDb, businessId),
      this.getStockProducts(tenantDb, businessId),
      this.getVendors(tenantDb, businessId),
      this.getCustomers(tenantDb, businessId),
      this.getSaleInvoices(tenantDb, businessId),
      this.getPurchaseInvoices(tenantDb, businessId),
      this.getDepartments(tenantDb, businessId),
      this.getDesignations(tenantDb, businessId),
      this.getEmployees(tenantDb, businessId),
      this.getPayPolicies(tenantDb, businessId),
      this.getSalaryComponents(tenantDb, businessId),
      this.getLoans(tenantDb, businessId),
    ]);

    return {
      roles,
      permissions,
      businesses,
      productCategories,
      productSubCategories,
      approvedSaleOrders,
      purchaseOrders,
      saleOrders,
      productBrands,
      flavours,
      uoms,
      warehouseList,
      productList,
      stockProducts,
      accountTypes,
      accountsByParentCode: Object.fromEntries(accountListEntries),
      vendors,
      customers,
      saleInvoices,
      purchaseInvoices,
      hrEnums: { result: this.getHrEnums() },
      departments,
      designations,
      employees,
      payPolicies,
      salaryComponents,
      loans,
    };
  }

  async getPayslip(tenantDb: DataSource, businessId: string) {
    const rows = await tenantDb
      .getRepository(Payslip)
      .createQueryBuilder('payslip')
      .innerJoin('payslip.employee', 'employee')
      .select('payslip.id', 'id')
      .addSelect('payslip.periodYear', 'periodYear')
      .addSelect('payslip.periodMonth', 'periodMonth')
      .addSelect('payslip.paymentDate', 'paymentDate')
      .addSelect('employee.fullName', 'employeeName')
      .where('payslip.businessId = :businessId', { businessId })
      .andWhere('payslip.deletedAt IS NULL')
      .andWhere('payslip.status = :status', {
        status: PayslipStatusEnum.APPROVED,
      })
      .andWhere((qb) => {
        const voucherSubQuery = qb
          .subQuery()
          .select('1')
          .from(SalaryVoucher, 'salaryVoucher')
          .where('salaryVoucher.payslipId = payslip.id')
          .andWhere('salaryVoucher.businessId = :businessId')
          .getQuery();

        return `NOT EXISTS ${voucherSubQuery}`;
      })
      .orderBy('payslip.periodYear', 'DESC')
      .addOrderBy('payslip.periodMonth', 'DESC')
      .addOrderBy('employee.fullName', 'ASC')
      .getRawMany<{
        id: string;
        periodYear: number;
        periodMonth: number;
        paymentDate: string;
        employeeName: string;
      }>();

    return {
      result: rows.map((row) => ({
        id: row.id,
        month: `${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}`,
        date: row.paymentDate,
        employeeName: row.employeeName,
      })),
    };
  }

  async getLoans(tenantDb: DataSource, businessId: string) {
    const loans = await tenantDb
      .getRepository(Loan)
      .createQueryBuilder('loan')
      .leftJoin('loan.loanAcc', 'loanAcc')
      .leftJoin('loan.receivingAcc', 'receivingAcc')
      .select('loan.id', 'id')
      .addSelect('loan.loanNumber', 'loanNumber')
      .addSelect('loan.loanName', 'loanName')
      .addSelect('loan.loanType', 'loanType')
      .addSelect('loan.status', 'status')
      .addSelect('loan.principalAmount', 'principalAmount')
      .addSelect('loan.loanAccId', 'loanAccId')
      .addSelect('loanAcc.code', 'loanAccCode')
      .addSelect('loanAcc.name', 'loanAccName')
      .addSelect('loan.receivingAccId', 'receivingAccId')
      .addSelect('receivingAcc.code', 'receivingAccCode')
      .addSelect('receivingAcc.name', 'receivingAccName')
      .where('loan.businessId = :businessId', { businessId })
      .andWhere('loan.deletedAt IS NULL')
      .andWhere('loan.status IN (:...statuses)', {
        statuses: [
          LoanStatus.APPROVED,
          LoanStatus.ACTIVE,
          LoanStatus.PARTIALLY_PAID,
        ],
      })
      .orderBy('loan.loanName', 'ASC')
      .addOrderBy('loan.loanNumber', 'ASC')
      .getRawMany();

    return { result: loans };
  }

}
