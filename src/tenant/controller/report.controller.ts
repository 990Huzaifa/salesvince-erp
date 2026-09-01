import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ReportService } from '../service/report.service';
import { ReportLedgerService } from '../service/report/report-ledger.service';
import { ReportOutstandingService } from '../service/report/report-outstanding.service';
import { ReportRegisterService } from '../service/report/report-register.service';
import { ReportStockService } from '../service/report/report-stock.service';
import { ReportFinancialService } from '../service/report/report-financial.service';
import { ReportFinancialTransactionService } from '../service/report/report-financial-transaction.service';
import { ReportTaxService } from '../service/report/report-tax.service';
import { ReportSaleChartService } from '../service/report/report-sale-chart.service';
import { ReportSaleOverviewService } from '../service/report/report-sale-overview.service';
import { ReportCustomerLowPaymentService } from '../service/report/report-customer-low-payment.service';
import { ReportReceivablePayableService } from '../service/report/report-receivable-payable.service';
import { ReportReceivingService } from '../service/report/report-receiving.service';
import { ReportGeneralLedgerQueryDto } from '../dto/report/report-ledger.query.dto';
import { ReportTrialBalanceQueryDto } from '../dto/report/report-ledger.query.dto';
import { ReportOutstandingDocumentsQueryDto } from '../dto/report/report-outstanding.query.dto';
import {
  ReportRegisterDocumentType,
  ReportRegisterQueryDto,
} from '../dto/report/report-register.query.dto';
import {
  ReportStockMovementQueryDto,
  ReportStockSummaryQueryDto,
  ReportStockValuationQueryDto,
} from '../dto/report/report-stock.query.dto';
import {
  ReportBalanceSheetQueryDto,
  ReportFinancialReportQueryDto,
  ReportProfitAndLossQueryDto,
  ReportTaxSummaryQueryDto,
} from '../dto/report/report-financial.query.dto';
import { ReportSaleChartQueryDto } from '../dto/report/report-sale-chart.query.dto';
import { ReportSaleOverviewQueryDto } from '../dto/report/report-sale-overview.query.dto';
import { ReportCustomerLowPaymentQueryDto } from '../dto/report/report-customer-low-payment.query.dto';
import { ReportPaginationQueryDto } from '../dto/report/report-pagination.query.dto';
import { ReportInvoiceSummaryQueryDto } from '../dto/report/report-invoice-summary.query.dto';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { sendPdf } from 'src/common/pdf';
import { ReportProfitQueryDto } from '../dto/report/report-profit.query.dto';
import { ReportReceivableQueryDto } from '../dto/report/report-receivable.query.dto';
import { ReportPayableQueryDto } from '../dto/report/report-payable.query.dto';
import { ReportReceivingQueryDto } from '../dto/report/report-receiving.query.dto';

@Controller('tenant/reports')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly reportLedgerService: ReportLedgerService,
    private readonly reportOutstandingService: ReportOutstandingService,
    private readonly reportRegisterService: ReportRegisterService,
    private readonly reportStockService: ReportStockService,
    private readonly reportFinancialService: ReportFinancialService,
    private readonly reportFinancialTransactionService: ReportFinancialTransactionService,
    private readonly reportTaxService: ReportTaxService,
    private readonly reportSaleChartService: ReportSaleChartService,
    private readonly reportSaleOverviewService: ReportSaleOverviewService,
    private readonly reportCustomerLowPaymentService: ReportCustomerLowPaymentService,
    private readonly reportReceivablePayableService: ReportReceivablePayableService,
    private readonly reportReceivingService: ReportReceivingService,
  ) {}

  @Get('cash-bank-balances')
  @RequirePermissions('VIEW_CASH_BANK_BALANCE_REPORT')
  getCashAndBankBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportPaginationQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getCashAndBankBalances(
      tenantDb,
      user.businessId,
      user.userId,
      { page: query.page ?? 1, limit: query.limit ?? 20 },
    );
  }

  @Get('customer-balances')
  @RequirePermissions('VIEW_CUSTOMER_BALANCE_REPORT')
  getCustomerBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportPaginationQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getCustomerBalances(
      tenantDb,
      user.businessId,
      user.userId,
      { page: query.page ?? 1, limit: query.limit ?? 20 },
    );
  }

  @Get('customers/low-payment')
  @RequirePermissions('VIEW_CUSTOMER_LOW_PAYMENT_REPORT')
  getCustomerLowPaymentReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportCustomerLowPaymentQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportCustomerLowPaymentService.getLowPaymentCustomers(
      tenantDb,
      user.businessId,
      user.userId,
      {
        search: query.search,
        cityId: query.cityId,
        minBalance: query.minBalance,
        maxBalance: query.maxBalance,
        minLastPaymentDays: query.minLastPaymentDays,
        maxLastPaymentDays: query.maxLastPaymentDays,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
    );
  }

  @Get('receivables')
  @RequirePermissions('VIEW_RECEIVABLE_REPORT')
  getReceivableReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportReceivableQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportReceivablePayableService.getReceivableReport(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.customerId,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('payables')
  @RequirePermissions('VIEW_PAYABLE_REPORT')
  getPayableReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportPayableQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportReceivablePayableService.getPayableReport(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.vendorId,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('receiving')
  @RequirePermissions('VIEW_RECEIVING_REPORT')
  getReceivingReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportReceivingQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportReceivingService.getReceivingReport(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.partyId,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('vendor-balances')
  @RequirePermissions('VIEW_VENDOR_BALANCE_REPORT')
  getVendorBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportPaginationQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getVendorBalances(
      tenantDb,
      user.businessId,
      user.userId,
      { page: query.page ?? 1, limit: query.limit ?? 20 },
    );
  }

  @Get('employee-balances')
  @RequirePermissions('VIEW_EMPLOYEE_BALANCE_REPORT')
  getEmployeeBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportPaginationQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getEmployeeBalances(
      tenantDb,
      user.businessId,
      user.userId,
      { page: query.page ?? 1, limit: query.limit ?? 20 },
    );
  }

  @Get('profit')
  @RequirePermissions('VIEW_PROFIT_REPORT')
  getProfitReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportProfitQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getProfitReport(
      tenantDb,
      user.businessId,
      {
        type: query.type,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('sales/overview')
  @RequirePermissions('VIEW_SALE_OVERVIEW_REPORT')
  getSaleOverviewReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportSaleOverviewQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportSaleOverviewService.getSaleOverview(
      tenantDb,
      user.businessId,
      {
        year: query.year,
        partyId: query.partyId,
        cityId: query.cityId,
      },
      user.userId,
    );
  }

  @Get('sales/chart')
  @RequirePermissions('VIEW_SALE_CHART_REPORT')
  getSaleChartReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportSaleChartQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportSaleChartService.getSaleChart(
      tenantDb,
      user.businessId,
      {
        filterType: query.filterType,
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.partyId,
        cityId: query.cityId,
      },
      user.userId,
    );
  }

  @Get('sales-summary')
  @RequirePermissions('VIEW_SALES_SUMMARY_REPORT')
  getSalesSummaryReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportInvoiceSummaryQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getSalesSummaryReport(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.partyId,
        cityId: query.cityId,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('purchase-summary')
  @RequirePermissions('VIEW_PURCHASE_SUMMARY_REPORT')
  getPurchaseSummaryReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportInvoiceSummaryQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getPurchaseSummaryReport(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.partyId,
        cityId: query.cityId,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('ledger/general')
  @RequirePermissions('VIEW_GENERAL_LEDGER_REPORT')
  getGeneralLedger(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportGeneralLedgerQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportLedgerService.getGeneralLedger(
      tenantDb,
      user.businessId,
      {
        chartOfAccountId: query.chartOfAccountId,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('ledger/general/:accountId/pdf')
  @RequirePermissions('VIEW_GENERAL_LEDGER_REPORT')
  async downloadGeneralLedgerPdf(
    @TenantConnection() tenantDb: DataSource,
    @Param('accountId') accountId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as TenantRequestUser;
    const { buffer, filename } =
      await this.reportLedgerService.generateGeneralLedgerPdf(
        tenantDb,
        user.businessId,
        accountId,
        user.userId,
        startDate,
        endDate,
      );
    sendPdf(res, { buffer, filename });
  }

  @Get('ledger/trial-balance')
  @RequirePermissions('VIEW_TRIAL_BALANCE_REPORT')
  getTrialBalance(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportTrialBalanceQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportLedgerService.getTrialBalance(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        asOfDate: query.asOfDate,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('outstanding/customer-documents')
  @RequirePermissions('VIEW_CUSTOMER_DOCUMENT_OUTSTANDING_REPORT')
  getCustomerDocumentOutstanding(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportOutstandingDocumentsQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportOutstandingService.getCustomerDocumentOutstanding(
      tenantDb,
      user.businessId,
      {
        partyId: query.partyId,
        page: query.page,
        limit: query.limit,
      },
      user.userId,
    );
  }

  @Get('outstanding/vendor-documents')
  @RequirePermissions('VIEW_VENDOR_DOCUMENT_OUTSTANDING_REPORT')
  getVendorDocumentOutstanding(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportOutstandingDocumentsQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportOutstandingService.getVendorDocumentOutstanding(
      tenantDb,
      user.businessId,
      {
        partyId: query.partyId,
        page: query.page,
        limit: query.limit,
      },
      user.userId,
    );
  }

  @Get('registers/:documentType')
  @RequirePermissions('VIEW_DOCUMENT_REGISTER_REPORT')
  getDocumentRegister(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Param('documentType', new ParseEnumPipe(ReportRegisterDocumentType))
    documentType: ReportRegisterDocumentType,
    @Query() query: ReportRegisterQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportRegisterService.getRegister(
      tenantDb,
      user.businessId,
      documentType,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        partyId: query.partyId,
        warehouseId: query.warehouseId,
        status: query.status,
        search: query.search,
        page: query.page,
        limit: query.limit,
      },
      user.userId,
    );
  }

  @Get('stock/summary')
  @RequirePermissions('VIEW_STOCK_SUMMARY_REPORT')
  getStockSummary(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportStockSummaryQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportStockService.getStockSummary(
      tenantDb,
      user.businessId,
      {
        scope: query.scope,
        warehouseId: query.warehouseId,
        productId: query.productId,
        uomId: query.uomId,
        search: query.search,
        page: query.page,
        limit: query.limit,
      },
      user.userId,
    );
  }

  @Get('stock/movements')
  @RequirePermissions('VIEW_STOCK_MOVEMENT_REPORT')
  getStockMovements(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportStockMovementQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportStockService.getStockMovements(
      tenantDb,
      user.businessId,
      {
        scope: query.scope,
        warehouseId: query.warehouseId,
        productId: query.productId,
        uomId: query.uomId,
        movementType: query.movementType,
        referenceType: query.referenceType,
        search: query.search,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page,
        limit: query.limit,
      },
      user.userId,
    );
  }

  @Get('stock/valuation')
  @RequirePermissions('VIEW_STOCK_VALUATION_REPORT')
  getStockValuation(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportStockValuationQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportStockService.getStockValuation(
      tenantDb,
      user.businessId,
      {
        scope: query.scope,
        warehouseId: query.warehouseId,
        productId: query.productId,
        search: query.search,
        page: query.page,
        limit: query.limit,
      },
      user.userId,
    );
  }

  @Get('financial/report')
  @RequirePermissions('VIEW_FINANCIAL_REPORT')
  getFinancialReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportFinancialReportQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportFinancialTransactionService.getFinancialReport(
      tenantDb,
      user.businessId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('financial/profit-and-loss')
  @RequirePermissions('VIEW_PROFIT_AND_LOSS_REPORT')
  getProfitAndLoss(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportProfitAndLossQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportFinancialService.getProfitAndLoss(
      tenantDb,
      user.businessId,
      { startDate: query.startDate, endDate: query.endDate },
      user.userId,
    );
  }

  @Get('financial/balance-sheet')
  @RequirePermissions('VIEW_BALANCE_SHEET_REPORT')
  getBalanceSheet(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportBalanceSheetQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportFinancialService.getBalanceSheet(
      tenantDb,
      user.businessId,
      {
        asOfDate: query.asOfDate,
        profitPeriodStartDate: query.profitPeriodStartDate,
      },
      user.userId,
    );
  }

  @Get('tax/summary')
  @RequirePermissions('VIEW_TAX_SUMMARY_REPORT')
  getTaxSummary(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ReportTaxSummaryQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportTaxService.getTaxSummary(
      tenantDb,
      user.businessId,
      { startDate: query.startDate, endDate: query.endDate },
      user.userId,
    );
  }
}
