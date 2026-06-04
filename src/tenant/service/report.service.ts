import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from 'src/tenant-db/entities/chart-of-account.entity';
import { COA_PARENT_CODES } from 'src/tenant-db/chart-of-accounts/constants/coa-parent-codes';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { computeBalanceMovement } from 'src/tenant-db/helpers/transaction-balance.helper';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { ActivityLogService } from './activity-log.service';
import { MasterGeoHelperService } from './master-geo-helper.service';

type BalanceRow = {
  chartOfAccountId: string;
  currentBalance: string | number | null;
};

type ReportAccountType = 'CASH' | 'BANK';

type PartyBalanceMode = 'CUSTOMER' | 'VENDOR';

type ProfitReportOptions = {
  startDate?: string;
  endDate?: string;
};

type InvoiceSummaryReportOptions = {
  startDate?: string;
  endDate?: string;
  partyId?: string;
  cityId?: string;
};

type InvoiceSummaryTotals = {
  invoiceCount: number;
  totalAmount: number;
  totalTaxAmount: number;
  totalDiscountAmount: number;
};

type InvoiceSummaryAggregateRow = {
  invoiceCount: string;
  totalAmount: string;
  totalTaxAmount: string;
  totalDiscountAmount: string;
};

type InvoiceSummaryPartyRow = InvoiceSummaryAggregateRow & {
  partyId: string;
  partyCode: string;
  partyName: string;
  cityId: string | null;
};

type InvoiceSummaryCityRow = InvoiceSummaryAggregateRow & {
  cityId: string | null;
};

type InvoiceSummaryKind = 'SALE' | 'PURCHASE';

type CostSnapshot = {
  purchaseUnitPrice: number;
  quantity: number;
};

@Injectable()
export class ReportService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private parseDateParam(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return parsed;
  }

  private parseDateRange(
    startDateStr?: string,
    endDateStr?: string,
  ): { startDate?: Date; endDate?: Date } {
    const startDate = startDateStr
      ? this.parseDateParam(startDateStr, 'startDate')
      : undefined;
    const endDate = endDateStr
      ? this.parseDateParam(endDateStr, 'endDate')
      : undefined;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'startDate must be on or before endDate',
      );
    }

    return { startDate, endDate };
  }

  private accountTypeFromParentCode(parentCode: string | null): ReportAccountType {
    return parentCode === COA_PARENT_CODES.BANK ? 'BANK' : 'CASH';
  }

  private async getLatestBalanceMap(
    tenantDb: DataSource,
    businessId: string,
    accountIds: string[],
  ): Promise<Map<string, number>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const rows = await tenantDb
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
      .getRawMany<BalanceRow>();

    return new Map(
      rows.map((row) => [
        row.chartOfAccountId,
        this.roundAmount(Number(row.currentBalance ?? 0)),
      ]),
    );
  }

  private async getOpeningBalanceMap(
    tenantDb: DataSource,
    businessId: string,
    accounts: ChartOfAccount[],
  ): Promise<Map<string, number>> {
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return new Map();
    }

    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const openingTransactions = await tenantDb.getRepository(Transaction).find({
      where: {
        businessId,
        chartOfAccountId: In(accountIds),
        referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
      },
      select: ['chartOfAccountId', 'debitAmount', 'creditAmount'],
    });

    const balances = new Map<string, number>();
    for (const tx of openingTransactions) {
      const account = accountById.get(tx.chartOfAccountId);
      if (!account) {
        continue;
      }
      const nature =
        account.accountKind === ChartOfAccountKind.PARTY_PAYABLE
          ? 'CREDIT'
          : 'DEBIT';
      const movement = computeBalanceMovement(
        nature,
        Number(tx.debitAmount ?? 0),
        Number(tx.creditAmount ?? 0),
      );
      const previous = balances.get(tx.chartOfAccountId) ?? 0;
      balances.set(tx.chartOfAccountId, this.roundAmount(previous + movement));
    }

    return balances;
  }

  private mapPartyBalance(
    party: Party,
    account: ChartOfAccount | null,
    openingBalance: number,
    currentBalance: number,
    mode: PartyBalanceMode,
  ) {
    return {
      id: party.id,
      name: party.name,
      accId: account?.id ?? null,
      accountCode: account?.code ?? null,
      code: party.code,
      address: party.address,
      openingBalance,
      currentBalance,
      partyType: party.type,
      balanceType: mode,
    };
  }

  private saleLineKey(
    productId: string,
    uomId: string,
    productFlavourId?: string | null,
  ): string {
    return `${productId}:${uomId}:${productFlavourId ?? ''}`;
  }

  private mapAggregateTotals(
    row?: InvoiceSummaryAggregateRow | null,
  ): InvoiceSummaryTotals {
    return {
      invoiceCount: Number(row?.invoiceCount ?? 0),
      totalAmount: this.roundAmount(Number(row?.totalAmount ?? 0)),
      totalTaxAmount: this.roundAmount(Number(row?.totalTaxAmount ?? 0)),
      totalDiscountAmount: this.roundAmount(
        Number(row?.totalDiscountAmount ?? 0),
      ),
    };
  }

  private async resolveCityNameMap(
    cityIds: Array<string | null | undefined>,
  ): Promise<Map<string, string | null>> {
    const uniqueCityIds = [
      ...new Set(
        cityIds.filter((cityId): cityId is string => Boolean(cityId?.trim())),
      ),
    ];
    const cityNames = new Map<string, string | null>();

    await Promise.all(
      uniqueCityIds.map(async (cityId) => {
        cityNames.set(
          cityId,
          await this.masterGeoHelperService.getCityNameById(cityId),
        );
      }),
    );

    return cityNames;
  }

  private cityDisplayName(
    cityId: string | null | undefined,
    cityNames: Map<string, string | null>,
  ): string {
    if (!cityId) {
      return 'Unknown';
    }
    return cityNames.get(cityId) ?? 'Unknown';
  }

  private applyInvoiceSummaryFilters(
    qb: ReturnType<
      ReturnType<DataSource['getRepository']>['createQueryBuilder']
    >,
    alias: string,
    partyAlias: string,
    businessId: string,
    filters: { startDate?: Date; endDate?: Date; partyId?: string; cityId?: string },
  ) {
    qb.where(`${alias}.businessId = :businessId`, { businessId }).andWhere(
      `${alias}.deletedAt IS NULL`,
    );

    if (filters.startDate) {
      qb.andWhere(`${alias}.invoiceDate >= :startDate`, {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      qb.andWhere(`${alias}.invoiceDate <= :endDate`, {
        endDate: filters.endDate,
      });
    }
    if (filters.partyId) {
      qb.andWhere(`${partyAlias}.id = :partyId`, {
        partyId: filters.partyId,
      });
    }
    if (filters.cityId) {
      qb.andWhere(`${partyAlias}.cityId = :cityId`, {
        cityId: filters.cityId,
      });
    }

    return qb;
  }

  private addInvoiceSummaryAggregates(
    qb: ReturnType<
      ReturnType<DataSource['getRepository']>['createQueryBuilder']
    >,
    alias: string,
  ) {
    return qb
      .select('COUNT(*)', 'invoiceCount')
      .addSelect(`COALESCE(SUM(${alias}.totalAmount), 0)`, 'totalAmount')
      .addSelect(`COALESCE(SUM(${alias}.totalTaxAmount), 0)`, 'totalTaxAmount')
      .addSelect(
        `COALESCE(SUM(${alias}.totalDiscountAmount), 0)`,
        'totalDiscountAmount',
      );
  }

  private async assertSummaryParty(
    tenantDb: DataSource,
    businessId: string,
    partyId: string,
    allowedTypes: PartyType[],
  ): Promise<Party> {
    const party = await tenantDb.getRepository(Party).findOne({
      where: {
        id: partyId,
        businessId,
        deletedAt: IsNull(),
      },
    });

    if (!party) {
      throw new BadRequestException('Party not found');
    }

    if (!allowedTypes.includes(party.type)) {
      throw new BadRequestException('Party type is not valid for this report');
    }

    return party;
  }

  private async buildInvoiceSummaryReport(
    tenantDb: DataSource,
    businessId: string,
    kind: InvoiceSummaryKind,
    options: InvoiceSummaryReportOptions,
    actorUserId: string,
    activityAction: string,
    activityDescription: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const { startDate, endDate } = this.parseDateRange(
      options.startDate,
      options.endDate,
    );
    const partyId = options.partyId?.trim() || undefined;
    const cityId = options.cityId?.trim() || undefined;
    const partyRelation = kind === 'SALE' ? 'customer' : 'vendor';
    const allowedPartyTypes =
      kind === 'SALE'
        ? [PartyType.CUSTOMER, PartyType.BOTH]
        : [PartyType.VENDOR, PartyType.BOTH];

    if (partyId) {
      await this.assertSummaryParty(
        tenantDb,
        scopedBusinessId,
        partyId,
        allowedPartyTypes,
      );
    }

    const filters = { startDate, endDate, partyId, cityId };
    const Entity = kind === 'SALE' ? SaleInvoice : PurchaseInvoice;

    const baseQb = () =>
      tenantDb
        .getRepository(Entity)
        .createQueryBuilder('invoice')
        .innerJoin(`invoice.${partyRelation}`, 'party');

    const totalsRow = await this.applyInvoiceSummaryFilters(
      this.addInvoiceSummaryAggregates(baseQb(), 'invoice'),
      'invoice',
      'party',
      scopedBusinessId,
      filters,
    ).getRawOne<InvoiceSummaryAggregateRow>();

    const partyRows = await this.applyInvoiceSummaryFilters(
      baseQb()
        .select('party.id', 'partyId')
        .addSelect('party.code', 'partyCode')
        .addSelect('party.name', 'partyName')
        .addSelect('party.cityId', 'cityId')
        .addSelect('COUNT(*)', 'invoiceCount')
        .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'totalAmount')
        .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'totalTaxAmount')
        .addSelect(
          'COALESCE(SUM(invoice.totalDiscountAmount), 0)',
          'totalDiscountAmount',
        ),
      'invoice',
      'party',
      scopedBusinessId,
      filters,
    )
      .groupBy('party.id')
      .addGroupBy('party.code')
      .addGroupBy('party.name')
      .addGroupBy('party.cityId')
      .orderBy('totalAmount', 'DESC')
      .getRawMany<InvoiceSummaryPartyRow>();

    const cityRows = await this.applyInvoiceSummaryFilters(
      baseQb()
        .select('party.cityId', 'cityId')
        .addSelect('COUNT(*)', 'invoiceCount')
        .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'totalAmount')
        .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'totalTaxAmount')
        .addSelect(
          'COALESCE(SUM(invoice.totalDiscountAmount), 0)',
          'totalDiscountAmount',
        ),
      'invoice',
      'party',
      scopedBusinessId,
      filters,
    )
      .groupBy('party.cityId')
      .orderBy('totalAmount', 'DESC')
      .getRawMany<InvoiceSummaryCityRow>();

    const cityNames = await this.resolveCityNameMap([
      ...partyRows.map((row) => row.cityId),
      ...cityRows.map((row) => row.cityId),
    ]);

    const partyWise = partyRows.map((row) => ({
      partyId: row.partyId,
      partyCode: row.partyCode,
      partyName: row.partyName,
      cityId: row.cityId,
      cityName: this.cityDisplayName(row.cityId, cityNames),
      ...this.mapAggregateTotals(row),
    }));

    const cityWise = cityRows.map((row) => ({
      cityId: row.cityId,
      cityName: this.cityDisplayName(row.cityId, cityNames),
      ...this.mapAggregateTotals(row),
    }));

    const totals = this.mapAggregateTotals(totalsRow);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: activityAction,
      description: activityDescription,
      metadata: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        partyId: partyId ?? null,
        cityId: cityId ?? null,
        totals,
      },
    });

    return {
      totals,
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      filters: {
        partyId: partyId ?? null,
        cityId: cityId ?? null,
        scope: partyId ? 'PARTY' : cityId ? 'CITY' : 'ALL',
      },
      partyWise,
      cityWise,
      meta: {
        partyCount: partyWise.length,
        cityCount: cityWise.length,
      },
    };
  }

  private profitGroupKey(
    productId: string,
    uomId: string,
    productFlavourId?: string | null,
  ): string {
    return this.saleLineKey(productId, uomId, productFlavourId);
  }

  private buildCostSnapshots(invoice: SaleInvoice): Map<string, CostSnapshot> {
    const snapshots = new Map<string, CostSnapshot>();
    const orderItems = invoice.saleOrder?.items ?? [];

    for (const item of orderItems) {
      const key = this.saleLineKey(
        item.productId,
        item.uomId,
        item.productFlavourId,
      );
      const existing = snapshots.get(key) ?? {
        purchaseUnitPrice: 0,
        quantity: 0,
      };
      const quantity = Number(item.quantity ?? 0);
      const previousCost = existing.purchaseUnitPrice * existing.quantity;
      const nextCost = Number(item.purchaseUnitPrice ?? 0) * quantity;
      const nextQuantity = existing.quantity + quantity;

      snapshots.set(key, {
        purchaseUnitPrice:
          nextQuantity > 0
            ? this.roundAmount((previousCost + nextCost) / nextQuantity)
            : 0,
        quantity: nextQuantity,
      });
    }

    return snapshots;
  }

  async getCashAndBankBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const accounts = await tenantDb.getRepository(ChartOfAccount).find({
      where: {
        businessId: scopedBusinessId,
        accountKind: ChartOfAccountKind.BUSINESS,
        parentCode: In([COA_PARENT_CODES.CASH, COA_PARENT_CODES.BANK]),
        isPostable: true,
        deletedAt: IsNull(),
      },
      order: { parentCode: 'ASC', code: 'ASC' },
    });

    const accountIds = accounts.map((account) => account.id);
    const [latestBalances, openingBalances] = await Promise.all([
      this.getLatestBalanceMap(tenantDb, scopedBusinessId, accountIds),
      this.getOpeningBalanceMap(tenantDb, scopedBusinessId, accounts),
    ]);

    const data = accounts.map((account) => ({
      accId: account.id,
      accountName: account.name,
      accountCode: account.code,
      accountType: this.accountTypeFromParentCode(account.parentCode),
      openingBalance: openingBalances.get(account.id) ?? 0,
      currentBalance: latestBalances.get(account.id) ?? 0,
    }));

    const totals = data.reduce(
      (sum, account) => {
        if (account.accountType === 'CASH') {
          sum.cash = this.roundAmount(sum.cash + account.currentBalance);
        } else {
          sum.bank = this.roundAmount(sum.bank + account.currentBalance);
        }
        return sum;
      },
      { cash: 0, bank: 0 },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CASH_BANK_BALANCE_REPORT_VIEWED',
      description: 'Cash and bank balance report viewed',
      metadata: { count: data.length, totals },
    });

    return {
      data,
      totals,
      meta: { total: data.length },
    };
  }

  async getCustomerBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const parties = await tenantDb.getRepository(Party).find({
      where: {
        businessId: scopedBusinessId,
        type: In([PartyType.CUSTOMER, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      relations: { receivableAccount: true },
      order: { name: 'ASC' },
    });

    const accounts = parties
      .map((party) => party.receivableAccount)
      .filter((account): account is ChartOfAccount => Boolean(account));
    const accountIds = accounts.map((account) => account.id);
    const latestBalances = await this.getLatestBalanceMap(
      tenantDb,
      scopedBusinessId,
      accountIds,
    );

    const data = parties.map((party) =>
      this.mapPartyBalance(
        party,
        party.receivableAccount,
        Number(party.receivableOpeningBalance ?? 0),
        party.receivableAccountId
          ? latestBalances.get(party.receivableAccountId) ?? 0
          : 0,
        'CUSTOMER',
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CUSTOMER_BALANCE_REPORT_VIEWED',
      description: 'Customer balance report viewed',
      metadata: { count: data.length },
    });

    return {
      data,
      totals: {
        currentBalance: this.roundAmount(
          data.reduce((sum, party) => sum + party.currentBalance, 0),
        ),
      },
      meta: { total: data.length },
    };
  }

  async getVendorBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const parties = await tenantDb.getRepository(Party).find({
      where: {
        businessId: scopedBusinessId,
        type: In([PartyType.VENDOR, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      relations: { payableAccount: true },
      order: { name: 'ASC' },
    });

    const accounts = parties
      .map((party) => party.payableAccount)
      .filter((account): account is ChartOfAccount => Boolean(account));
    const accountIds = accounts.map((account) => account.id);
    const latestBalances = await this.getLatestBalanceMap(
      tenantDb,
      scopedBusinessId,
      accountIds,
    );

    const data = parties.map((party) =>
      this.mapPartyBalance(
        party,
        party.payableAccount,
        Number(party.payableOpeningBalance ?? 0),
        party.payableAccountId ? latestBalances.get(party.payableAccountId) ?? 0 : 0,
        'VENDOR',
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'VENDOR_BALANCE_REPORT_VIEWED',
      description: 'Vendor balance report viewed',
      metadata: { count: data.length },
    });

    return {
      data,
      totals: {
        currentBalance: this.roundAmount(
          data.reduce((sum, party) => sum + party.currentBalance, 0),
        ),
      },
      meta: { total: data.length },
    };
  }

  async getProfitReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: ProfitReportOptions,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const { startDate, endDate } = this.parseDateRange(
      options.startDate,
      options.endDate,
    );

    const qb = tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('saleOrder.items', 'saleOrderItems')
      .where('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('items.deletedAt IS NULL');

    if (startDate) {
      qb.andWhere('invoice.invoiceDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('invoice.invoiceDate <= :endDate', { endDate });
    }

    const invoices = await qb
      .orderBy('invoice.invoiceDate', 'ASC')
      .addOrderBy('invoice.createdAt', 'ASC')
      .getMany();

    const reportRows = new Map<
      string,
      {
        productId: string;
        productName: string;
        skuCode: string | null;
        productFlavourId: string | null;
        flavourName: string | null;
        uomId: string;
        uomName: string | null;
        totalQuantity: number;
        totalSale: number;
        totalCost: number;
        profit: number;
      }
    >();

    for (const invoice of invoices) {
      const costSnapshots = this.buildCostSnapshots(invoice);

      for (const item of invoice.items ?? []) {
        const costSnapshot = costSnapshots.get(
          this.saleLineKey(item.productId, item.uomId, item.productFlavourId),
        );
        const quantity = Number(item.quantity ?? 0);
        const totalSale = Number(item.totalAmount ?? 0);
        const totalCost = this.roundAmount(
          (costSnapshot?.purchaseUnitPrice ?? 0) * quantity,
        );
        const key = this.profitGroupKey(
          item.productId,
          item.uomId,
          item.productFlavourId,
        );
        const existing = reportRows.get(key);
        const next = existing ?? {
          productId: item.productId,
          productName: item.product?.name ?? '',
          skuCode: item.product?.skuCode ?? null,
          productFlavourId: item.productFlavourId ?? null,
          flavourName: item.productFlavour?.flavour?.name ?? null,
          uomId: item.uomId,
          uomName: item.uom?.name ?? null,
          totalQuantity: 0,
          totalSale: 0,
          totalCost: 0,
          profit: 0,
        };

        next.totalQuantity = this.roundAmount(next.totalQuantity + quantity);
        next.totalSale = this.roundAmount(next.totalSale + totalSale);
        next.totalCost = this.roundAmount(next.totalCost + totalCost);
        next.profit = this.roundAmount(next.totalSale - next.totalCost);
        reportRows.set(key, next);
      }
    }

    const data = [...reportRows.values()]
      .map((row) => ({
        ...row,
        profitPercentage:
          row.totalSale > 0
            ? this.roundAmount((row.profit / row.totalSale) * 100)
            : 0,
      }))
      .sort((left, right) => right.profit - left.profit);

    const totals = data.reduce(
      (sum, row) => {
        sum.totalSale = this.roundAmount(sum.totalSale + row.totalSale);
        sum.totalCost = this.roundAmount(sum.totalCost + row.totalCost);
        sum.profit = this.roundAmount(sum.totalSale - sum.totalCost);
        return sum;
      },
      { totalSale: 0, totalCost: 0, profit: 0 },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PROFIT_REPORT_VIEWED',
      description: 'Profit report viewed',
      metadata: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        count: data.length,
        totals,
      },
    });

    return {
      totals,
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      data,
      meta: { total: data.length },
    };
  }

  async getSalesSummaryReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: InvoiceSummaryReportOptions,
    actorUserId: string,
  ) {
    return this.buildInvoiceSummaryReport(
      tenantDb,
      businessId,
      'SALE',
      options,
      actorUserId,
      'SALES_SUMMARY_REPORT_VIEWED',
      'Sales summary report viewed',
    );
  }

  async getPurchaseSummaryReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: InvoiceSummaryReportOptions,
    actorUserId: string,
  ) {
    return this.buildInvoiceSummaryReport(
      tenantDb,
      businessId,
      'PURCHASE',
      options,
      actorUserId,
      'PURCHASE_SUMMARY_REPORT_VIEWED',
      'Purchase summary report viewed',
    );
  }
}
