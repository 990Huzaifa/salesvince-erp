import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DocumentTemplateDocumentType } from 'src/master-db/entities/document-template-item.entity';
import { PdfLogoService, PdfRendererService, safePdfFilenamePart } from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { AccountTransactionReferenceType, Transaction } from 'src/tenant-db/entities/transaction.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { computeBalanceMovement, getAccountBalanceNature } from 'src/tenant-db/helpers/transaction-balance.helper';
import { TenantUtilityService } from '../tenant-utility.service';
import { DocumentTemplateRendererService } from '../document-template-renderer.service';

@Injectable()
export class OpeningBalancePdfService {
  constructor(
    private readonly utilityService: TenantUtilityService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
    private readonly documentTemplateRendererService: DocumentTemplateRendererService,
  ) {}

  async generatePdf(
    db: DataSource,
    businessId: string | undefined,
    actorUserId: string,
    parentCode: string,
    category: string,
    search?: string,
    tenantId?: string,
    clientIp?: string,
  ) {
    if (!businessId) throw new BadRequestException('Business context is required');
    if (!/^\d(?:-\d+)*$/.test(parentCode)) {
      throw new BadRequestException('A valid account parent code is required');
    }

    const [accountList, business, actor] = await Promise.all([
      this.utilityService.getAccountList(db, parentCode, businessId),
      db.getRepository(Business).findOne({ where: { id: businessId } }),
      db.getRepository(User).findOne({ where: { id: actorUserId }, select: { id: true, name: true } }),
    ]);
    if (!business) throw new NotFoundException('Business not found');

    const accountIds = accountList.result.map((account) => account.id);
    const openingBalances = new Map<string, number>();
    if (accountIds.length > 0) {
      const [accounts, openingTransactions] = await Promise.all([
        db.getRepository(ChartOfAccount).find({
          where: { id: In(accountIds), businessId },
          select: ['id', 'accountKind', 'level1'],
        }),
        db.getRepository(Transaction).find({
          where: {
            businessId,
            chartOfAccountId: In(accountIds),
            referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
          },
          select: ['chartOfAccountId', 'debitAmount', 'creditAmount'],
        }),
      ]);
      const accountById = new Map(accounts.map((account) => [account.id, account]));
      for (const transaction of openingTransactions) {
        const account = accountById.get(transaction.chartOfAccountId);
        if (!account) continue;
        const movement = computeBalanceMovement(
          getAccountBalanceNature(account),
          Number(transaction.debitAmount ?? 0),
          Number(transaction.creditAmount ?? 0),
        );
        const previous = openingBalances.get(transaction.chartOfAccountId) ?? 0;
        openingBalances.set(transaction.chartOfAccountId, Math.round((previous + movement) * 100) / 100);
      }
    }

    const normalizedSearch = search?.trim().toLowerCase();
    const matchingAccounts = accountList.result.filter((account) =>
      !normalizedSearch ||
      account.code.toLowerCase().includes(normalizedSearch) ||
      account.name.toLowerCase().includes(normalizedSearch),
    );
    const rows = matchingAccounts.map((account, index) => ({
      ...account,
      serial: index + 1,
      code: account.code,
      name: account.name,
      openingBalance: openingBalances.get(account.id) ?? 0,
    }));
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const companyInfo = {
      name: business.name,
      legalName: business.legalName,
      address: business.address,
      phone: business.phone,
      mobile: business.phone,
      currency: business.currency,
      logo: logoDataUri,
    };
    const html = await this.documentTemplateRendererService.render(
      db,
      businessId,
      DocumentTemplateDocumentType.ACCOUNTS_LIST,
      {
        accounts: rows,
        accountRows: rows,
        items: rows,
        rows,
        category,
        search: search?.trim() || '',
        companyInfo,
        preparedBy: actor?.name || 'Admin',
      },
      tenantId,
      clientIp,
    );
    const buffer = await this.pdfRendererService.renderHtmlToPdf({
      html,
      enforceSinglePage: false,
    });

    return {
      buffer,
      filename: `${safePdfFilenamePart(`Opening-Balance-${category || 'Report'}`)}.pdf`,
    };
  }
}
