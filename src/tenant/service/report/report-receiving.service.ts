import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, IsNull, SelectQueryBuilder } from 'typeorm';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  resolvePagination,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type ReceivingReportOptions = {
  startDate?: string;
  endDate?: string;
  partyId?: string;
  page?: number;
  limit?: number;
};

type ReceivingReportRow = {
  id: string;
  voucherNumber: string;
  partyId: string;
  partyCode: string;
  partyName: string;
  paymentDate: Date;
  paymentAmount: number;
  paymentMethod: string;
  chequeNumber: string | null;
  chequeDate: Date | null;
  accId: string;
  accountCode: string | null;
  accountName: string | null;
  remarks: string | null;
};

type ReceivingReportTotals = {
  voucherCount: number;
  totalAmount: number;
};

@Injectable()
export class ReportReceivingService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getReceivingReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: ReceivingReportOptions,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );
    const partyId = options.partyId?.trim() || undefined;

    if (partyId) {
      await this.assertCustomerParty(tenantDb, scopedBusinessId, partyId);
    }

    const totalsQb = this.createBaseQuery(tenantDb, scopedBusinessId)
      .select('COUNT(*)', 'voucherCount')
      .addSelect('COALESCE(SUM(voucher.paymentAmount), 0)', 'totalAmount');
    this.applyFilters(totalsQb, { partyId, startDate, endDate });

    const totalsRow = await totalsQb.getRawOne<{
      voucherCount: string;
      totalAmount: string;
    }>();

    const totals: ReceivingReportTotals = {
      voucherCount: Number(totalsRow?.voucherCount ?? 0),
      totalAmount: roundAmount(Number(totalsRow?.totalAmount ?? 0)),
    };

    const { page, limit, skip } = resolvePagination(options.page, options.limit);

    const listQb = this.createBaseQuery(tenantDb, scopedBusinessId)
      .select('voucher.id', 'id')
      .addSelect('voucher.voucherNumber', 'voucherNumber')
      .addSelect('voucher.partyId', 'partyId')
      .addSelect('party.code', 'partyCode')
      .addSelect('party.name', 'partyName')
      .addSelect('voucher.paymentDate', 'paymentDate')
      .addSelect('voucher.paymentAmount', 'paymentAmount')
      .addSelect('voucher.paymentMethod', 'paymentMethod')
      .addSelect('voucher.chequeNumber', 'chequeNumber')
      .addSelect('voucher.chequeDate', 'chequeDate')
      .addSelect('voucher.accId', 'accId')
      .addSelect('acc.code', 'accountCode')
      .addSelect('acc.name', 'accountName')
      .addSelect('voucher.remarks', 'remarks');

    this.applyFilters(listQb, { partyId, startDate, endDate });

    const rows = await listQb
      .orderBy('voucher.paymentDate', 'DESC')
      .addOrderBy('voucher.createdAt', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany<ReceivingReportRow>();

    const data = rows.map((row) => ({
      ...row,
      paymentAmount: roundAmount(Number(row.paymentAmount ?? 0)),
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'RECEIVING_REPORT_VIEWED',
      description: 'Receiving report viewed',
      metadata: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        partyId: partyId ?? null,
        totals,
      },
    });

    return {
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      data,
      totals,
      meta: {
        total: totals.voucherCount,
        page,
        limit,
      },
    };
  }

  private createBaseQuery(
    tenantDb: DataSource,
    businessId: string,
  ): SelectQueryBuilder<SaleVoucher> {
    return tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.party', 'party')
      .leftJoin('voucher.acc', 'acc')
      .where('party.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PAID });
  }

  private applyFilters(
    qb: SelectQueryBuilder<SaleVoucher>,
    filters: {
      partyId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): void {
    if (filters.partyId) {
      qb.andWhere('voucher.partyId = :partyId', { partyId: filters.partyId });
    }
    if (filters.startDate) {
      qb.andWhere('voucher.paymentDate >= :startDate', {
        startDate: startOfDay(filters.startDate),
      });
    }
    if (filters.endDate) {
      qb.andWhere('voucher.paymentDate <= :endDate', {
        endDate: endOfDay(filters.endDate),
      });
    }
  }

  private async assertCustomerParty(
    tenantDb: DataSource,
    businessId: string,
    partyId: string,
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

    if (
      party.type !== PartyType.CUSTOMER &&
      party.type !== PartyType.BOTH
    ) {
      throw new BadRequestException(
        'Party type is not valid for receiving report',
      );
    }

    return party;
  }
}
