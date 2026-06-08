import { BadRequestException, Injectable } from '@nestjs/common';
import { Between, DataSource } from 'typeorm';
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
  assertBusinessId,
  endOfDay,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type TaxTotalsRow = {
  grossAmount: string;
  taxAmount: string;
  discountAmount: string;
  documentCount: string;
};

type MonthlyTaxRow = {
  monthKey: string;
  outputTax: string;
  inputTax: string;
};

type PartyTaxRow = {
  partyId: string;
  partyCode: string;
  partyName: string;
  taxAmount: string;
  grossAmount: string;
  documentCount: string;
};

@Injectable()
export class ReportTaxService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getTaxSummary(
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

    const [
      sales,
      purchases,
      saleReturnAdjustments,
      purchaseReturnAdjustments,
      monthlyBreakdown,
      outputByCustomer,
      inputByVendor,
    ] = await Promise.all([
      this.aggregateSaleInvoices(tenantDb, scopedBusinessId, startDate, endDate),
      this.aggregatePurchaseInvoices(
        tenantDb,
        scopedBusinessId,
        startDate,
        endDate,
      ),
      this.aggregateSaleReturnTax(tenantDb, scopedBusinessId, startDate, endDate),
      this.aggregatePurchaseReturnTax(
        tenantDb,
        scopedBusinessId,
        startDate,
        endDate,
      ),
      this.buildMonthlyBreakdown(tenantDb, scopedBusinessId, startDate, endDate),
      this.buildOutputTaxByCustomer(tenantDb, scopedBusinessId, startDate, endDate),
      this.buildInputTaxByVendor(tenantDb, scopedBusinessId, startDate, endDate),
    ]);

    const grossOutputTax = roundAmount(sales.taxAmount);
    const grossInputTax = roundAmount(purchases.taxAmount);
    const outputTaxCredits = roundAmount(saleReturnAdjustments.taxAmount);
    const inputTaxCredits = roundAmount(purchaseReturnAdjustments.taxAmount);

    const netOutputTax = roundAmount(grossOutputTax - outputTaxCredits);
    const netInputTax = roundAmount(grossInputTax - inputTaxCredits);
    const netTaxPayable = roundAmount(netOutputTax - netInputTax);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'TAX_SUMMARY_REPORT_VIEWED',
      description: 'Tax summary report viewed',
      metadata: {
        startDate: options.startDate,
        endDate: options.endDate,
        netOutputTax,
        netInputTax,
        netTaxPayable,
      },
    });

    return {
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      outputTax: {
        gross: grossOutputTax,
        returns: outputTaxCredits,
        net: netOutputTax,
        taxableSales: roundAmount(sales.grossAmount - sales.taxAmount),
        grossSales: sales.grossAmount,
        discount: sales.discountAmount,
        documentCount: sales.documentCount,
      },
      inputTax: {
        gross: grossInputTax,
        returns: inputTaxCredits,
        net: netInputTax,
        taxablePurchases: roundAmount(purchases.grossAmount - purchases.taxAmount),
        grossPurchases: purchases.grossAmount,
        discount: purchases.discountAmount,
        documentCount: purchases.documentCount,
      },
      netTaxPayable,
      monthlyBreakdown,
      outputByCustomer,
      inputByVendor,
    };
  }

  private async aggregateSaleInvoices(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const row = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'grossAmount')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'taxAmount')
      .addSelect('COALESCE(SUM(invoice.totalDiscountAmount), 0)', 'discountAmount')
      .addSelect('COUNT(*)', 'documentCount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', {
        endDate: endOfDay(endDate),
      })
      .getRawOne<TaxTotalsRow>();

    return this.mapTaxTotals(row);
  }

  private async aggregatePurchaseInvoices(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const row = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'grossAmount')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'taxAmount')
      .addSelect('COALESCE(SUM(invoice.totalDiscountAmount), 0)', 'discountAmount')
      .addSelect('COUNT(*)', 'documentCount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', {
        endDate: endOfDay(endDate),
      })
      .getRawOne<TaxTotalsRow>();

    return this.mapTaxTotals(row);
  }

  private async aggregateSaleReturnTax(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const returns = await tenantDb.getRepository(SaleReturn).find({
      where: {
        businessId,
        status: SaleReturnStatus.APPROVED,
        returnDate: Between(startOfDay(startDate), endOfDay(endDate)),
      },
      relations: {
        saleReturnItems: true,
        saleInvoice: { items: true },
      },
    });

    let taxAmount = 0;
    let grossAmount = 0;

    for (const saleReturn of returns) {
      for (const returnItem of saleReturn.saleReturnItems ?? []) {
        const invoiceItem = saleReturn.saleInvoice?.items?.find(
          (item) =>
            item.productId === returnItem.productId &&
            item.uomId === returnItem.uomId &&
            (item.productFlavourId ?? null) === (returnItem.productFlavourId ?? null),
        );
        if (!invoiceItem || Number(invoiceItem.quantity) <= 0) {
          continue;
        }

        const ratio = Number(returnItem.quantity) / Number(invoiceItem.quantity);
        taxAmount += Number(invoiceItem.taxAmount ?? 0) * ratio;
        grossAmount += Number(invoiceItem.totalAmount ?? 0) * ratio;
      }
    }

    return {
      taxAmount: roundAmount(taxAmount),
      grossAmount: roundAmount(grossAmount),
      documentCount: returns.length,
    };
  }

  private async aggregatePurchaseReturnTax(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const returns = await tenantDb.getRepository(PurchaseReturn).find({
      where: {
        businessId,
        status: PurchaseReturnStatus.APPROVED,
        returnDate: Between(startOfDay(startDate), endOfDay(endDate)),
      },
      relations: {
        purchaseReturnItems: true,
        purchaseInvoice: { items: true },
      },
    });

    let taxAmount = 0;
    let grossAmount = 0;

    for (const purchaseReturn of returns) {
      for (const returnItem of purchaseReturn.purchaseReturnItems ?? []) {
        const invoiceItem = purchaseReturn.purchaseInvoice?.items?.find(
          (item) =>
            item.productId === returnItem.productId &&
            item.uomId === returnItem.uomId &&
            (item.productFlavourId ?? null) === (returnItem.productFlavourId ?? null),
        );
        if (!invoiceItem || Number(invoiceItem.quantity) <= 0) {
          continue;
        }

        const ratio = Number(returnItem.quantity) / Number(invoiceItem.quantity);
        taxAmount += Number(invoiceItem.taxAmount ?? 0) * ratio;
        grossAmount += Number(invoiceItem.totalAmount ?? 0) * ratio;
      }
    }

    return {
      taxAmount: roundAmount(taxAmount),
      grossAmount: roundAmount(grossAmount),
      documentCount: returns.length,
    };
  }

  private async buildMonthlyBreakdown(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const salesByMonth = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .select(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`, 'monthKey')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'outputTax')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', { endDate: endOfDay(endDate) })
      .groupBy(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`)
      .getRawMany<MonthlyTaxRow>();

    const purchasesByMonth = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .select(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`, 'monthKey')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'inputTax')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', { endDate: endOfDay(endDate) })
      .groupBy(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`)
      .getRawMany<MonthlyTaxRow>();

    const monthMap = new Map<
      string,
      { monthKey: string; outputTax: number; inputTax: number; netTaxPayable: number }
    >();

    for (const row of salesByMonth) {
      monthMap.set(row.monthKey, {
        monthKey: row.monthKey,
        outputTax: roundAmount(Number(row.outputTax ?? 0)),
        inputTax: 0,
        netTaxPayable: 0,
      });
    }

    for (const row of purchasesByMonth) {
      const existing = monthMap.get(row.monthKey) ?? {
        monthKey: row.monthKey,
        outputTax: 0,
        inputTax: 0,
        netTaxPayable: 0,
      };
      existing.inputTax = roundAmount(Number(row.inputTax ?? 0));
      monthMap.set(row.monthKey, existing);
    }

    return [...monthMap.values()]
      .map((row) => ({
        ...row,
        netTaxPayable: roundAmount(row.outputTax - row.inputTax),
      }))
      .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  }

  private async buildOutputTaxByCustomer(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const rows = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .innerJoin('invoice.customer', 'party')
      .select('party.id', 'partyId')
      .addSelect('party.code', 'partyCode')
      .addSelect('party.name', 'partyName')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'taxAmount')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'grossAmount')
      .addSelect('COUNT(*)', 'documentCount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', { endDate: endOfDay(endDate) })
      .groupBy('party.id')
      .addGroupBy('party.code')
      .addGroupBy('party.name')
      .orderBy('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'DESC')
      .limit(20)
      .getRawMany<PartyTaxRow>();

    return rows.map((row) => ({
      partyId: row.partyId,
      partyCode: row.partyCode,
      partyName: row.partyName,
      taxAmount: roundAmount(Number(row.taxAmount ?? 0)),
      grossAmount: roundAmount(Number(row.grossAmount ?? 0)),
      documentCount: Number(row.documentCount ?? 0),
    }));
  }

  private async buildInputTaxByVendor(
    tenantDb: DataSource,
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const rows = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .innerJoin('invoice.vendor', 'party')
      .select('party.id', 'partyId')
      .addSelect('party.code', 'partyCode')
      .addSelect('party.name', 'partyName')
      .addSelect('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'taxAmount')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'grossAmount')
      .addSelect('COUNT(*)', 'documentCount')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(startDate),
      })
      .andWhere('invoice.invoiceDate <= :endDate', { endDate: endOfDay(endDate) })
      .groupBy('party.id')
      .addGroupBy('party.code')
      .addGroupBy('party.name')
      .orderBy('COALESCE(SUM(invoice.totalTaxAmount), 0)', 'DESC')
      .limit(20)
      .getRawMany<PartyTaxRow>();

    return rows.map((row) => ({
      partyId: row.partyId,
      partyCode: row.partyCode,
      partyName: row.partyName,
      taxAmount: roundAmount(Number(row.taxAmount ?? 0)),
      grossAmount: roundAmount(Number(row.grossAmount ?? 0)),
      documentCount: Number(row.documentCount ?? 0),
    }));
  }

  private mapTaxTotals(row?: TaxTotalsRow | null) {
    return {
      grossAmount: roundAmount(Number(row?.grossAmount ?? 0)),
      taxAmount: roundAmount(Number(row?.taxAmount ?? 0)),
      discountAmount: roundAmount(Number(row?.discountAmount ?? 0)),
      documentCount: Number(row?.documentCount ?? 0),
    };
  }
}
