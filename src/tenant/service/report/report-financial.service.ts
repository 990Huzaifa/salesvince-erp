import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { Batch } from 'src/tenant-db/entities/stock.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  computeProfitAndLossAmount,
  displayBalanceSheetAmount,
  displayExpenseCurrentBalance,
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
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';

type FinancialLine = {
  chartOfAccountId: string | null;
  accountCode: string;
  accountName: string;
  amount: number;
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

  private async buildProfitAndLoss(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const [incomeAccounts, expenseAccounts] = await Promise.all([
      loadPostableAccountsByLevel(tenantDb, businessId, 4),
      // Expense head (level1 = 5) ke saare postable/leaf accounts.
      loadPostableAccountsByLevel(tenantDb, businessId, 5),
    ]);

    const [incomeMovements, expenseBalances] = await Promise.all([
      getPeriodMovementsByAccount(
        tenantDb,
        businessId,
        incomeAccounts.map((account) => account.id),
        startDate,
        endDate,
      ),
      // Expense lines = each leaf account's current balance as of period end.
      getBalancesAsOfMap(tenantDb, businessId, expenseAccounts, endDate),
    ]);

    const incomeLines = this.buildProfitAndLossLines(
      incomeAccounts,
      incomeMovements,
    );
    const expenseLines = this.buildExpenseLinesFromCurrentBalances(
      expenseAccounts,
      expenseBalances,
    );

    const totalIncome = roundAmount(
      incomeLines.reduce((sum, line) => sum + line.amount, 0),
    );
    const totalExpenses = roundAmount(
      expenseLines.reduce((sum, line) => sum + line.amount, 0),
    );
    const netProfit = roundAmount(totalIncome - totalExpenses);
    const operational = await this.buildOperationalSummary(
      tenantDb,
      businessId,
      startDate,
      endDate,
    );

    // Authoritative total sale = SUM(sale_invoices.totalAmount) in period.
    const totalSale = operational.sales.totalSale;
    const currentStockValue = operational.currentStockValue;

    return {
      totalSale,
      currentStockValue,
      ledger: {
        income: { lines: incomeLines, total: totalIncome },
        expenses: { lines: expenseLines, total: totalExpenses },
        netProfit,
      },
      operational,
      meta: {
        incomeAccountCount: incomeLines.length,
        expenseAccountCount: expenseLines.length,
      },
    };
  }

  private buildProfitAndLossLines(
    accounts: Awaited<ReturnType<typeof loadPostableAccountsByLevel>>,
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
      .sort((left, right) => right.amount - left.amount);
  }

  /**
   * Expense head ke andar jitne leaf (postable) accounts hain, unki
   * currentBalance lines mein aati hai; total = un balances ka sum.
   */
  private buildExpenseLinesFromCurrentBalances(
    accounts: ChartOfAccount[],
    balances: Map<string, number>,
  ): FinancialLine[] {
    return accounts
      .map((account) => ({
        chartOfAccountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        amount: displayExpenseCurrentBalance(balances.get(account.id) ?? 0),
      }))
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

  private async buildOperationalSummary(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
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

    const purchaseTotals = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'grossPurchases')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'inputTax')
      .addSelect('COALESCE(SUM(invoice.totalDiscountAmount), 0)', 'purchaseDiscount')
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
      }>();

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

    // Total sale must always be SUM of all sale invoice totalAmount in range.
    const totalSale = roundAmount(Number(saleTotals?.totalSale ?? 0));
    const outputTax = roundAmount(Number(saleTotals?.outputTax ?? 0));
    const salesDiscount = roundAmount(Number(saleTotals?.salesDiscount ?? 0));
    const grossPurchases = roundAmount(Number(purchaseTotals?.grossPurchases ?? 0));
    const inputTax = roundAmount(Number(purchaseTotals?.inputTax ?? 0));
    const purchaseDiscount = roundAmount(
      Number(purchaseTotals?.purchaseDiscount ?? 0),
    );
    const currentStockValue = roundAmount(
      Number(stockValueRow?.currentStockValue ?? 0),
    );

    const netSales = roundAmount(totalSale - outputTax);
    const netPurchases = roundAmount(grossPurchases - inputTax);
    // Trading P&L: Sales - (Purchases - Closing Stock). Opening stock not tracked historically.
    const costOfGoodsSold = roundAmount(netPurchases - currentStockValue);
    const grossProfit = roundAmount(netSales - costOfGoodsSold);

    return {
      sales: {
        invoiceCount: Number(saleTotals?.invoiceCount ?? 0),
        totalSale,
        // Backward-compatible alias of totalSale (SUM invoice.totalAmount).
        grossSales: totalSale,
        netSales,
        outputTax,
        discount: salesDiscount,
      },
      purchases: {
        invoiceCount: Number(purchaseTotals?.invoiceCount ?? 0),
        grossPurchases,
        netPurchases,
        inputTax,
        discount: purchaseDiscount,
      },
      currentStockValue,
      costOfGoodsSold,
      grossProfit,
    };
  }
}
