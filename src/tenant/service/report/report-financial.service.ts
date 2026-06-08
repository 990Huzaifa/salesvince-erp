import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import {
  SaleReturn,
  SaleReturnStatus,
} from 'src/tenant-db/entities/sale-return.entity';
import {
  PurchaseReturn,
  PurchaseReturnStatus,
} from 'src/tenant-db/entities/purchase-return.entity';
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
      loadPostableAccountsByLevel(tenantDb, businessId, 5),
    ]);

    const allAccounts = [...incomeAccounts, ...expenseAccounts];
    const movements = await getPeriodMovementsByAccount(
      tenantDb,
      businessId,
      allAccounts.map((account) => account.id),
      startDate,
      endDate,
    );

    const incomeLines = this.buildProfitAndLossLines(incomeAccounts, movements);
    const expenseLines = this.buildProfitAndLossLines(expenseAccounts, movements);

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

    return {
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
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'grossSales')
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
        grossSales: string;
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

    const grossSales = roundAmount(Number(saleTotals?.grossSales ?? 0));
    const outputTax = roundAmount(Number(saleTotals?.outputTax ?? 0));
    const salesDiscount = roundAmount(Number(saleTotals?.salesDiscount ?? 0));
    const grossPurchases = roundAmount(Number(purchaseTotals?.grossPurchases ?? 0));
    const inputTax = roundAmount(Number(purchaseTotals?.inputTax ?? 0));
    const purchaseDiscount = roundAmount(
      Number(purchaseTotals?.purchaseDiscount ?? 0),
    );

    const netSales = roundAmount(grossSales - outputTax);
    const netPurchases = roundAmount(grossPurchases - inputTax);
    const grossProfit = roundAmount(netSales - netPurchases);

    return {
      sales: {
        invoiceCount: Number(saleTotals?.invoiceCount ?? 0),
        grossSales,
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
      grossProfit,
    };
  }
}
