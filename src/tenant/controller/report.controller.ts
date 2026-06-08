import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { ReportTaxService } from '../service/report/report-tax.service';
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
  ReportProfitAndLossQueryDto,
  ReportTaxSummaryQueryDto,
} from '../dto/report/report-financial.query.dto';

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
    private readonly reportTaxService: ReportTaxService,
  ) {}

  @Get('cash-bank-balances')
  getCashAndBankBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getCashAndBankBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('customer-balances')
  getCustomerBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getCustomerBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('vendor-balances')
  getVendorBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getVendorBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('employee-balances')
  getEmployeeBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getEmployeeBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('profit')
  getProfitReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getProfitReport(
      tenantDb,
      user.businessId,
      { startDate, endDate },
      user.userId,
    );
  }

  @Get('sales-summary')
  getSalesSummaryReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('partyId') partyId?: string,
    @Query('cityId') cityId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getSalesSummaryReport(
      tenantDb,
      user.businessId,
      { startDate, endDate, partyId, cityId },
      user.userId,
    );
  }

  @Get('purchase-summary')
  getPurchaseSummaryReport(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('partyId') partyId?: string,
    @Query('cityId') cityId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getPurchaseSummaryReport(
      tenantDb,
      user.businessId,
      { startDate, endDate, partyId, cityId },
      user.userId,
    );
  }

  @Get('ledger/general')
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
      },
      user.userId,
    );
  }

  @Get('ledger/trial-balance')
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
      },
      user.userId,
    );
  }

  @Get('outstanding/customer-documents')
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

  @Get('financial/profit-and-loss')
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
