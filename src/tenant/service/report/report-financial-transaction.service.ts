import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from 'src/tenant-db/entities/chart-of-account.entity';
import { Transaction } from 'src/tenant-db/entities/transaction.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type FinancialCategory = 'purchases' | 'sales' | 'expenses' | 'income';

type FinancialTransactionRow = {
  id: string;
  businessId: string;
  chartOfAccountId: string;
  transactionType: string;
  transactionDate: Date;
  description: string | null;
  referenceId: string | null;
  debit: string;
  credit: string;
  currentBalance: string;
  createdAt: Date;
  updatedAt: Date;
};

type FinancialSection = {
  data: FinancialTransactionRow[];
  total: number;
};

const TRANSACTION_TYPE_BY_CATEGORY: Record<FinancialCategory, string> = {
  purchases: '0',
  sales: '1',
  expenses: '2',
  income: '3',
};

@Injectable()
export class ReportFinancialTransactionService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getFinancialReport(
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

    const report = await this.buildFinancialReport(
      tenantDb,
      scopedBusinessId,
      startDate,
      endDate,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'FINANCIAL_REPORT_VIEWED',
      description: 'Financial report viewed',
      metadata: {
        startDate: options.startDate,
        endDate: options.endDate,
        purchasesTotal: report.purchases.total,
        salesTotal: report.sales.total,
        expensesTotal: report.expenses.total,
        incomeTotal: report.income.total,
        netProfit: report.netProfit,
      },
    });

    return report;
  }

  private async buildFinancialReport(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const rows = await tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('tx')
      .innerJoinAndMapOne(
        'tx.chartOfAccount',
        ChartOfAccount,
        'coa',
        'coa.id = tx.chartOfAccountId AND coa.deletedAt IS NULL',
      )
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.transactionDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('tx.transactionDate <= :endDate', {
        endDate: endOfDay(endDate),
      })
      .andWhere(
        `(coa.accountKind IN (:...partyKinds) OR coa.level1 IN (:...plLevels))`,
        {
          partyKinds: [
            ChartOfAccountKind.PARTY_PAYABLE,
            ChartOfAccountKind.PARTY_RECEIVABLE,
          ],
          plLevels: [4, 5],
        },
      )
      .orderBy('tx.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .addOrderBy('tx.id', 'DESC')
      .getMany();

    const sections: Record<FinancialCategory, FinancialSection> = {
      purchases: { data: [], total: 0 },
      sales: { data: [], total: 0 },
      expenses: { data: [], total: 0 },
      income: { data: [], total: 0 },
    };

    for (const tx of rows) {
      const account = tx.chartOfAccount as ChartOfAccount | undefined;
      if (!account) {
        continue;
      }

      const category = this.resolveCategory(account);
      if (!category) {
        continue;
      }

      const debit = roundAmount(Number(tx.debitAmount ?? 0));
      const credit = roundAmount(Number(tx.creditAmount ?? 0));
      const contribution = this.getContributionAmount(category, debit, credit);

      sections[category].data.push({
        id: tx.id,
        businessId: tx.businessId,
        chartOfAccountId: tx.chartOfAccountId,
        transactionType: TRANSACTION_TYPE_BY_CATEGORY[category],
        transactionDate: tx.transactionDate,
        description: tx.description,
        referenceId: tx.referenceId,
        debit: this.formatAmount(debit),
        credit: this.formatAmount(credit),
        currentBalance: this.formatAmount(Number(tx.currentBalance ?? 0)),
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      });
      sections[category].total = roundAmount(
        sections[category].total + contribution,
      );
    }

    const netProfit = roundAmount(
      sections.sales.total -
        sections.purchases.total -
        sections.expenses.total +
        sections.income.total,
    );

    return {
      purchases: sections.purchases,
      sales: sections.sales,
      expenses: sections.expenses,
      income: sections.income,
      netProfit,
    };
  }

  private resolveCategory(
    account: Pick<ChartOfAccount, 'accountKind' | 'level1'>,
  ): FinancialCategory | null {
    if (account.accountKind === ChartOfAccountKind.PARTY_PAYABLE) {
      return 'purchases';
    }
    if (account.accountKind === ChartOfAccountKind.PARTY_RECEIVABLE) {
      return 'sales';
    }
    if (account.level1 === 5) {
      return 'expenses';
    }
    if (account.level1 === 4) {
      return 'income';
    }
    return null;
  }

  private getContributionAmount(
    category: FinancialCategory,
    debit: number,
    credit: number,
  ): number {
    switch (category) {
      case 'purchases':
        return credit;
      case 'sales':
        return debit;
      case 'expenses':
      case 'income':
        return Math.max(debit, credit);
      default:
        return 0;
    }
  }

  private formatAmount(value: number): string {
    return roundAmount(value).toFixed(2);
  }
}
