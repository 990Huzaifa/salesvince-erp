import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { Batch } from 'src/tenant-db/entities/stock.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { COA_PARENT_CODES } from 'src/tenant-db/chart-of-accounts/constants/coa-parent-codes';
import { ActivityLogService } from '../activity-log.service';
import {
  computeProfitAndLossAmount,
  displayBalanceSheetAmount,
  getBalancesAsOfMap,
  getPeriodMovementsByAccount,
  loadPostableAccountsByLevel,
} from './report-account-balance.helper';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';
import {
  aggregateApprovedPurchaseReturns,
  aggregateApprovedSaleReturns,
} from './report-returns.helper';

type FinancialLine = {
  chartOfAccountId: string | null;
  accountCode: string;
  accountName: string;
  amount: number;
};

type FinancialSection = {
  lines: FinancialLine[];
  total: number;
};

@Injectable()
export class ReportFinancialService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getProfitAndLoss(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { startDate?: string; endDate?: string },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );

    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const report = await this.buildProfitAndLoss(
      tenantDb,
      scopedBusinessId,
      startDate,
      endDate,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PROFIT_AND_LOSS_REPORT_VIEWED',
      description: 'Profit and loss report viewed',
      metadata: {
        startDate: options.startDate,
        endDate: options.endDate,
        totalSale: report.totalSale,
        currentStockValue: report.currentStockValue,
        salesRevenue: report.trading.salesRevenue.total,
        costOfGoodsSold: report.trading.costOfGoodsSold.total,
        grossProfit: report.trading.grossProfit,
        totalIncome: report.ledger.income.total,
        totalExpenses: report.ledger.expenses.total,
        netProfit: report.ledger.netProfit,
      },
    });

    return {
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      ...report,
    };
  }

  async getBalanceSheet(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { asOfDate?: string; profitPeriodStartDate?: string },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const asOfDate = options.asOfDate
      ? parseDateRange(undefined, options.asOfDate).endDate
      : new Date();

    if (!asOfDate) {
      throw new BadRequestException('asOfDate could not be resolved');
    }

    const profitPeriodStart = options.profitPeriodStartDate
      ? parseDateRange(options.profitPeriodStartDate, undefined).startDate
      : new Date(asOfDate.getFullYear(), 0, 1);

    const [assetAccounts, liabilityAccounts, equityAccounts] = await Promise.all([
      loadPostableAccountsByLevel(tenantDb, scopedBusinessId, 1),
      loadPostableAccountsByLevel(tenantDb, scopedBusinessId, 2),
      loadPostableAccountsByLevel(tenantDb, scopedBusinessId, 3),
    ]);

    const allAccounts = [
      ...assetAccounts,
      ...liabilityAccounts,
      ...equityAccounts,
    ];
    const balances = await getBalancesAsOfMap(
      tenantDb,
      scopedBusinessId,
      allAccounts,
      asOfDate,
    );

    const assets = this.buildBalanceSheetSection(assetAccounts, balances);
    const liabilities = this.buildBalanceSheetSection(
      liabilityAccounts,
      balances,
    );
    const equity = this.buildBalanceSheetSection(equityAccounts, balances);

    let currentPeriodProfit = 0;
    if (profitPeriodStart && profitPeriodStart <= asOfDate) {
      const pl = await this.buildProfitAndLoss(
        tenantDb,
        scopedBusinessId,
        profitPeriodStart,
        asOfDate,
      );
      currentPeriodProfit = pl.ledger.netProfit;
    }

    const equityLines: FinancialLine[] = [...equity.lines];
    if (currentPeriodProfit !== 0) {
      equityLines.push({
        chartOfAccountId: null,
        accountCode: 'COMPUTED',
        accountName:
          currentPeriodProfit >= 0
            ? 'Current Period Profit (Unposted)'
            : 'Current Period Loss (Unposted)',
        amount: roundAmount(Math.abs(currentPeriodProfit)),
      });
    }

    const totalEquity = roundAmount(equity.total + currentPeriodProfit);
    const totalAssets = assets.total;
    const totalLiabilities = liabilities.total;
    const liabilitiesPlusEquity = roundAmount(totalLiabilities + totalEquity);
    const difference = roundAmount(totalAssets - liabilitiesPlusEquity);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'BALANCE_SHEET_REPORT_VIEWED',
      description: 'Balance sheet report viewed',
      metadata: {
        asOfDate: options.asOfDate ?? asOfDate.toISOString().slice(0, 10),
        totalAssets,
        totalLiabilities,
        totalEquity,
        difference,
      },
    });

    return {
      asOfDate: options.asOfDate ?? asOfDate.toISOString().slice(0, 10),
      sections: {
        assets,
        liabilities,
        equity: {
          lines: equityLines,
          total: totalEquity,
        },
      },
      currentPeriodProfit,
      balanceCheck: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        liabilitiesPlusEquity,
        difference,
        isBalanced: difference === 0,
      },
      meta: {
        assetAccountCount: assets.lines.length,
        liabilityAccountCount: liabilities.lines.length,
        equityAccountCount: equity.lines.length,
      },
    };
  }

  /**
   * Ledger-based P&L:
   *   Sales Revenue (4-1 + other income)
   * − Cost of Goods Sold (5-1)
   * = Gross Profit
   * − Operating expenses (level-5 except COGS)
   * = Net Profit
   *
   * Inventory (1-1-4) is a Balance Sheet account and is not included here.
   */
  private async buildProfitAndLoss(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const [incomeAccounts, expenseAccounts] = await Promise.all([
      loadPostableAccountsByLevel(tenantDb, businessId, 4),
      loadPostableAccountsByLevel(tenantDb, businessId, 5),
    ]);

    const allAccountIds = [
      ...incomeAccounts.map((account) => account.id),
      ...expenseAccounts.map((account) => account.id),
    ];

    const movements = await getPeriodMovementsByAccount(
      tenantDb,
      businessId,
      allAccountIds,
      startDate,
      endDate,
    );

    const incomeLines = this.buildProfitAndLossLines(incomeAccounts, movements);
    const expenseLines = this.buildProfitAndLossLines(
      expenseAccounts,
      movements,
    );

    const salesRevenueLines = incomeLines.filter((line) =>
      this.isSalesRevenueAccountCode(line.accountCode),
    );
    const otherIncomeLines = incomeLines.filter(
      (line) => !this.isSalesRevenueAccountCode(line.accountCode),
    );
    const cogsLines = expenseLines.filter((line) =>
      this.isCogsAccountCode(line.accountCode),
    );
    const operatingExpenseLines = expenseLines.filter(
      (line) => !this.isCogsAccountCode(line.accountCode),
    );

    const salesRevenue = this.toSection(salesRevenueLines);
    const otherIncome = this.toSection(otherIncomeLines);
    const income = this.toSection(incomeLines);
    const costOfGoodsSold = this.toSection(cogsLines);
    const operatingExpenses = this.toSection(operatingExpenseLines);
    const expenses = this.toSection(expenseLines);

    const grossProfit = roundAmount(
      salesRevenue.total - costOfGoodsSold.total,
    );
    const netProfit = roundAmount(income.total - expenses.total);

    const currentStockValue = await this.getCurrentStockValue(
      tenantDb,
      businessId,
    );
    const operational = await this.buildOperationalSummary(
      tenantDb,
      businessId,
      startDate,
      endDate,
      {
        salesRevenue: salesRevenue.total,
        costOfGoodsSold: costOfGoodsSold.total,
        grossProfit,
        currentStockValue,
      },
    );

    // Authoritative sale figure = Sales Revenue ledger movement in period
    // (includes opening balance + DN postings − sale returns).
    const totalSale = salesRevenue.total;

    return {
      totalSale,
      currentStockValue,
      trading: {
        salesRevenue,
        otherIncome,
        costOfGoodsSold,
        grossProfit,
      },
      ledger: {
        income,
        expenses,
        operatingExpenses,
        grossProfit,
        netProfit,
      },
      operational,
      meta: {
        incomeAccountCount: incomeLines.length,
        expenseAccountCount: expenseLines.length,
        salesRevenueAccountCount: salesRevenueLines.length,
        cogsAccountCount: cogsLines.length,
        operatingExpenseAccountCount: operatingExpenseLines.length,
      },
    };
  }

  private isSalesRevenueAccountCode(code: string): boolean {
    return (
      code === COA_PARENT_CODES.SALES_REVENUE ||
      code.startsWith(`${COA_PARENT_CODES.SALES_REVENUE}-`)
    );
  }

  private isCogsAccountCode(code: string): boolean {
    return (
      code === COA_PARENT_CODES.COST_OF_GOODS_SOLD ||
      code.startsWith(`${COA_PARENT_CODES.COST_OF_GOODS_SOLD}-`)
    );
  }

  private toSection(lines: FinancialLine[]): FinancialSection {
    return {
      lines,
      total: roundAmount(lines.reduce((sum, line) => sum + line.amount, 0)),
    };
  }

  private buildProfitAndLossLines(
    accounts: ChartOfAccount[],
    movements: Map<string, { debit: number; credit: number }>,
  ): FinancialLine[] {
    return accounts
      .map((account) => {
        const movement = movements.get(account.id) ?? { debit: 0, credit: 0 };
        return {
          chartOfAccountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          amount: computeProfitAndLossAmount(
            account,
            movement.debit,
            movement.credit,
          ),
        };
      })
      .filter((line) => line.amount !== 0)
      .sort((left, right) => left.accountCode.localeCompare(right.accountCode));
  }

  private buildBalanceSheetSection(
    accounts: Awaited<ReturnType<typeof loadPostableAccountsByLevel>>,
    balances: Map<string, number>,
  ) {
    const lines = accounts
      .map((account) => ({
        chartOfAccountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        amount: displayBalanceSheetAmount(
          account,
          balances.get(account.id) ?? 0,
        ),
      }))
      .filter((line) => line.amount !== 0);

    return {
      lines,
      total: roundAmount(lines.reduce((sum, line) => sum + line.amount, 0)),
    };
  }

  private async getCurrentStockValue(
    tenantDb: DataSource,
    businessId: string,
  ): Promise<number> {
    const stockValueRow = await tenantDb
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .innerJoin('batch.product', 'product')
      .innerJoin('batch.warehouse', 'warehouse')
      .select(
        'COALESCE(SUM(batch.quantity * batch.purchaseUnitPrice), 0)',
        'currentStockValue',
      )
      .where('batch.businessId = :businessId', { businessId })
      .andWhere('batch.deletedAt IS NULL')
      .andWhere('batch.quantity > 0')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('warehouse.deletedAt IS NULL')
      .getRawOne<{ currentStockValue: string }>();

    return roundAmount(Number(stockValueRow?.currentStockValue ?? 0));
  }

  /**
   * Invoice/stock side-stats for UI. Trading P&L figures come from ledger
   * (Sales Revenue / COGS), not Purchases − Closing Stock.
   */
  private async buildOperationalSummary(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
    ledgerTrading: {
      salesRevenue: number;
      costOfGoodsSold: number;
      grossProfit: number;
      currentStockValue: number;
    },
  ) {
    const saleTotals = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'totalSale')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'outputTax')
      .addSelect('COALESCE(SUM(invoice.totalDiscountAmount), 0)', 'salesDiscount')
      .addSelect('COUNT(*)', 'invoiceCount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', {
        endDate: endOfDay(endDate),
      })
      .getRawOne<{
        totalSale: string;
        outputTax: string;
        salesDiscount: string;
        invoiceCount: string;
      }>();

    const [purchaseTotals, saleReturns, purchaseReturns] = await Promise.all([
      tenantDb
        .getRepository(PurchaseInvoice)
        .createQueryBuilder('invoice')
        .select('COALESCE(SUM(invoice.totalAmount), 0)', 'grossPurchases')
        .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'inputTax')
        .addSelect(
          'COALESCE(SUM(invoice.totalDiscountAmount), 0)',
          'purchaseDiscount',
        )
        .addSelect('COUNT(*)', 'invoiceCount')
        .where('invoice.businessId = :businessId', { businessId })
        .andWhere('invoice.deletedAt IS NULL')
        .andWhere('invoice.invoiceDate >= :startDate', {
          startDate: startOfDay(startDate),
        })
        .andWhere('invoice.invoiceDate <= :endDate', {
          endDate: endOfDay(endDate),
        })
        .getRawOne<{
          grossPurchases: string;
          inputTax: string;
          purchaseDiscount: string;
          invoiceCount: string;
        }>(),
      aggregateApprovedSaleReturns(tenantDb, businessId, {
        startDate,
        endDate,
      }),
      aggregateApprovedPurchaseReturns(tenantDb, businessId, {
        startDate,
        endDate,
      }),
    ]);

    const invoiceGrossSale = roundAmount(Number(saleTotals?.totalSale ?? 0));
    const invoiceOutputTax = roundAmount(Number(saleTotals?.outputTax ?? 0));
    const invoiceSalesDiscount = roundAmount(
      Number(saleTotals?.salesDiscount ?? 0),
    );
    const invoiceGrossPurchases = roundAmount(
      Number(purchaseTotals?.grossPurchases ?? 0),
    );
    const invoiceInputTax = roundAmount(Number(purchaseTotals?.inputTax ?? 0));
    const invoicePurchaseDiscount = roundAmount(
      Number(purchaseTotals?.purchaseDiscount ?? 0),
    );

    // Net of approved returns (invoice cards should match trading reality).
    const totalSale = roundAmount(
      invoiceGrossSale - saleReturns.grossAmount,
    );
    const outputTax = roundAmount(invoiceOutputTax - saleReturns.taxAmount);
    const salesDiscount = roundAmount(
      invoiceSalesDiscount - saleReturns.discountAmount,
    );
    const grossPurchases = roundAmount(
      invoiceGrossPurchases - purchaseReturns.grossAmount,
    );
    const inputTax = roundAmount(invoiceInputTax - purchaseReturns.taxAmount);
    const purchaseDiscount = roundAmount(
      invoicePurchaseDiscount - purchaseReturns.discountAmount,
    );

    const netSales = roundAmount(totalSale - outputTax);
    const netPurchases = roundAmount(grossPurchases - inputTax);

    return {
      sales: {
        invoiceCount: Number(saleTotals?.invoiceCount ?? 0),
        returnCount: saleReturns.documentCount,
        /** Sale invoices − approved sale returns. */
        totalSale,
        grossSales: invoiceGrossSale,
        salesReturns: saleReturns.grossAmount,
        netSales,
        /** Ledger Sales Revenue for the period (authoritative for P&L). */
        ledgerSalesRevenue: ledgerTrading.salesRevenue,
        outputTax,
        discount: salesDiscount,
      },
      purchases: {
        invoiceCount: Number(purchaseTotals?.invoiceCount ?? 0),
        returnCount: purchaseReturns.documentCount,
        /** Purchase invoices − approved purchase returns. */
        grossPurchases,
        invoiceGrossPurchases,
        purchaseReturns: purchaseReturns.grossAmount,
        netPurchases,
        inputTax,
        discount: purchaseDiscount,
      },
      currentStockValue: ledgerTrading.currentStockValue,
      /** Ledger COGS (5-1) period movement — not Purchases − Stock. */
      costOfGoodsSold: ledgerTrading.costOfGoodsSold,
      grossProfit: ledgerTrading.grossProfit,
    };
  }
}
