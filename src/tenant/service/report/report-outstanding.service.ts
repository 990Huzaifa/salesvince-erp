import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  DeliveryNote,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import {
  computeBalanceMovement,
  getAccountBalanceNature,
} from 'src/tenant-db/helpers/transaction-balance.helper';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  resolvePagination,
  roundAmount,
} from './report-query.helper';

type OutstandingMode = 'CUSTOMER' | 'VENDOR';

type DocumentCharge = {
  id: string;
  documentType: string;
  documentNumber: string;
  documentDate: Date;
  originalAmount: number;
  openAmount: number;
  isFullyPaid: boolean;
};

@Injectable()
export class ReportOutstandingService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getCustomerDocumentOutstanding(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { partyId?: string; page?: number; limit?: number },
    actorUserId: string,
  ) {
    return this.getDocumentOutstanding(
      tenantDb,
      businessId,
      'CUSTOMER',
      options,
      actorUserId,
      'CUSTOMER_DOCUMENT_OUTSTANDING_REPORT_VIEWED',
      'Customer document outstanding report viewed',
    );
  }

  async getVendorDocumentOutstanding(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { partyId?: string; page?: number; limit?: number },
    actorUserId: string,
  ) {
    return this.getDocumentOutstanding(
      tenantDb,
      businessId,
      'VENDOR',
      options,
      actorUserId,
      'VENDOR_DOCUMENT_OUTSTANDING_REPORT_VIEWED',
      'Vendor document outstanding report viewed',
    );
  }

  private async getDocumentOutstanding(
    tenantDb: DataSource,
    businessId: string | undefined,
    mode: OutstandingMode,
    options: { partyId?: string; page?: number; limit?: number },
    actorUserId: string,
    activityAction: string,
    activityDescription: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { page, limit, skip } = resolvePagination(options.page, options.limit);
    const partyTypes =
      mode === 'CUSTOMER'
        ? [PartyType.CUSTOMER, PartyType.BOTH]
        : [PartyType.VENDOR, PartyType.BOTH];

    const partyQb = tenantDb
      .getRepository(Party)
      .createQueryBuilder('party')
      .where('party.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('party.deletedAt IS NULL')
      .andWhere('party.type IN (:...partyTypes)', { partyTypes });

    if (options.partyId) {
      partyQb.andWhere('party.id = :partyId', { partyId: options.partyId });
    }

    const parties = await partyQb.orderBy('party.name', 'ASC').getMany();

    const partySummaries = await Promise.all(
      parties.map((party) => this.buildPartyOutstanding(tenantDb, scopedBusinessId, mode, party)),
    );

    const flatDocuments = partySummaries.flatMap((party) =>
      party.documents.map((document) => ({
        ...document,
        partyId: party.partyId,
        partyCode: party.partyCode,
        partyName: party.partyName,
        partyCurrentBalance: party.currentBalance,
      })),
    );

    const openDocuments = flatDocuments.filter((document) => document.openAmount > 0);
    const total = openDocuments.length;
    const data = openDocuments.slice(skip, skip + limit);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: activityAction,
      description: activityDescription,
      metadata: {
        partyId: options.partyId ?? null,
        partyCount: parties.length,
        openDocumentCount: total,
      },
    });

    return {
      mode,
      filters: { partyId: options.partyId ?? null },
      data,
      partySummaries: partySummaries.map((party) => ({
        partyId: party.partyId,
        partyCode: party.partyCode,
        partyName: party.partyName,
        currentBalance: party.currentBalance,
        openDocumentCount: party.documents.filter((doc) => doc.openAmount > 0).length,
        totalOpenAmount: roundAmount(
          party.documents.reduce((sum, doc) => sum + doc.openAmount, 0),
        ),
      })),
      totals: {
        openDocumentCount: total,
        totalOpenAmount: roundAmount(
          openDocuments.reduce((sum, doc) => sum + doc.openAmount, 0),
        ),
      },
      meta: { total, page, limit },
    };
  }

  private async buildPartyOutstanding(
    tenantDb: DataSource,
    businessId: string,
    mode: OutstandingMode,
    party: Party,
  ) {
    const ledgerAccountId =
      mode === 'CUSTOMER' ? party.receivableAccountId : party.payableAccountId;

    if (!ledgerAccountId) {
      return {
        partyId: party.id,
        partyCode: party.code,
        partyName: party.name,
        currentBalance: 0,
        documents: [] as DocumentCharge[],
      };
    }

    const coa = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: ledgerAccountId, businessId, deletedAt: IsNull() },
    });

    if (!coa) {
      return {
        partyId: party.id,
        partyCode: party.code,
        partyName: party.name,
        currentBalance: 0,
        documents: [] as DocumentCharge[],
      };
    }

    const transactions = await tenantDb.getRepository(Transaction).find({
      where: { businessId, chartOfAccountId: ledgerAccountId },
      order: { transactionDate: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });

    const nature = getAccountBalanceNature(coa);
    const openingBalance = roundAmount(
      Number(
        mode === 'CUSTOMER'
          ? party.receivableOpeningBalance
          : party.payableOpeningBalance,
      ),
    );

    const documents = await this.buildDocumentsWithFifo(
      tenantDb,
      businessId,
      mode,
      party,
      transactions,
      nature,
      openingBalance,
    );

    const currentBalance =
      transactions.length > 0
        ? roundAmount(Number(transactions[transactions.length - 1].currentBalance ?? 0))
        : openingBalance;

    return {
      partyId: party.id,
      partyCode: party.code,
      partyName: party.name,
      currentBalance,
      documents,
    };
  }

  private async buildDocumentsWithFifo(
    tenantDb: DataSource,
    businessId: string,
    mode: OutstandingMode,
    party: Party,
    transactions: Transaction[],
    nature: ReturnType<typeof getAccountBalanceNature>,
    openingBalance: number,
  ): Promise<DocumentCharge[]> {
    const charges: DocumentCharge[] = [];

    if (openingBalance > 0) {
      charges.push({
        id: `opening-${party.id}`,
        documentType: 'OPENING_BALANCE',
        documentNumber: 'OPENING',
        documentDate: new Date(0),
        originalAmount: openingBalance,
        openAmount: openingBalance,
        isFullyPaid: false,
      });
    }

    const documentMeta = await this.loadDocumentMetadata(
      tenantDb,
      businessId,
      mode,
      party.id,
      transactions,
    );

    for (const tx of transactions) {
      const debit = Number(tx.debitAmount ?? 0);
      const credit = Number(tx.creditAmount ?? 0);
      const movement = computeBalanceMovement(nature, debit, credit);

      if (movement <= 0) {
        continue;
      }

      if (tx.referenceType === AccountTransactionReferenceType.OPENING_BALANCE) {
        continue;
      }

      const meta = documentMeta.get(`${tx.referenceType}:${tx.referenceId ?? ''}`);
      charges.push({
        id: tx.referenceId ?? tx.id,
        documentType: tx.referenceType,
        documentNumber: meta?.documentNumber ?? tx.referenceType,
        documentDate: meta?.documentDate ?? tx.transactionDate,
        originalAmount: roundAmount(movement),
        openAmount: roundAmount(movement),
        isFullyPaid: false,
      });
    }

    const paymentPool = transactions.reduce((pool, tx) => {
      const debit = Number(tx.debitAmount ?? 0);
      const credit = Number(tx.creditAmount ?? 0);
      const movement = computeBalanceMovement(nature, debit, credit);
      if (movement < 0) {
        return roundAmount(pool + Math.abs(movement));
      }
      return pool;
    }, 0);

    let remainingPool = paymentPool;
    for (const charge of charges) {
      if (remainingPool <= 0) {
        break;
      }
      const applied = Math.min(charge.openAmount, remainingPool);
      charge.openAmount = roundAmount(charge.openAmount - applied);
      charge.isFullyPaid = charge.openAmount === 0;
      remainingPool = roundAmount(remainingPool - applied);
    }

    return charges.sort(
      (left, right) => left.documentDate.getTime() - right.documentDate.getTime(),
    );
  }

  private async loadDocumentMetadata(
    tenantDb: DataSource,
    businessId: string,
    mode: OutstandingMode,
    partyId: string,
    transactions: Transaction[],
  ): Promise<Map<string, { documentNumber: string; documentDate: Date }>> {
    const meta = new Map<string, { documentNumber: string; documentDate: Date }>();

    const dnIds = transactions
      .filter(
        (tx) => tx.referenceType === AccountTransactionReferenceType.DELIVERY_NOTE,
      )
      .map((tx) => tx.referenceId)
      .filter((id): id is string => Boolean(id));

    if (mode === 'CUSTOMER' && dnIds.length > 0) {
      const notes = await tenantDb.getRepository(DeliveryNote).find({
        where: {
          id: In(dnIds),
          businessId,
          customerId: partyId,
          status: DeliveryNoteStatus.APPROVED,
        },
      });
      for (const note of notes) {
        meta.set(`${AccountTransactionReferenceType.DELIVERY_NOTE}:${note.id}`, {
          documentNumber: note.deliveryNoteNumber,
          documentDate: note.deliveryNoteDate,
        });
      }
    }

    const grnIds = transactions
      .filter((tx) => tx.referenceType === AccountTransactionReferenceType.GRN)
      .map((tx) => tx.referenceId)
      .filter((id): id is string => Boolean(id));

    if (mode === 'VENDOR' && grnIds.length > 0) {
      const grns = await tenantDb.getRepository(Grn).find({
        where: {
          id: In(grnIds),
          businessId,
          vendorId: partyId,
          status: GrnStatus.APPROVED,
        },
      });
      for (const grn of grns) {
        meta.set(`${AccountTransactionReferenceType.GRN}:${grn.id}`, {
          documentNumber: grn.grnNumber,
          documentDate: grn.grnDate,
        });
      }
    }

    return meta;
  }
}
