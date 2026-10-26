import { TenantBusinessAccessGuard } from "src/auth/tenant-business-access.guard";
import { TenantCode, TenantConnection } from "src/common/tenant/tenant-connection.decorator";
import { DataSource } from "typeorm";
import {
    Body,
    Controller,
    Get,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { TenantPermissionGuard } from "src/auth/tenant-permission.guard";
import { TenantRequestUser } from "src/auth/tenant-jwt.strategy";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";
import { RequirePermissions } from "src/auth/require-permission.decorator";
import { BackfillTradingLedgerDto } from "../dto/transaction/backfill-trading-ledger.dto";
import { MissingTradingLedgerBackfillService } from "../service/missing-trading-ledger-backfill.service";
import { TransactionService } from "../service/transaction.service";

@Controller('tenant/transactions')
@UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantBusinessAccessGuard,
    TenantPermissionGuard,
)
export class TransactionController {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly missingTradingLedgerBackfillService: MissingTradingLedgerBackfillService,
    ) { }

    @Get('')
    @RequirePermissions('LIST_TRANSACTION')
    async listTransactions(@TenantConnection() tenantDb: DataSource, @Req() req: Request, @Query('page') page: number = 1, @Query('limit') limit: number = 10, @Query('search') search: string = '') {
        const user = req.user as TenantRequestUser;
        return this.transactionService.listTransactions(tenantDb, user.businessId, {
            page: page,
            limit: limit,
            search: search,
        }, user.userId);
    }

    /**
     * Post opening balance for a COA that has no ledger rows yet.
     * Debit/credit is decided from account nature (assets/expenses → debit, etc.).
     */
    @Post('opening-balance')
    @RequirePermissions('UPDATE_CHART_OF_ACCOUNT')
    createOpeningBalance(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
        @Query('chartOfAccountId', ParseUUIDPipe) chartOfAccountId: string,
        @Query('amount') amount: string,
        @Query('transactionDate') transactionDate?: string,
    ) {
        const user = req.user as TenantRequestUser;
        return this.transactionService.createOpeningBalanceForAccount(
            tenantDb,
            user.businessId,
            {
                chartOfAccountId,
                amount: Number(amount),
                transactionDate,
            },
            user.userId,
        );
    }

    @Post('recalculate')
    @RequirePermissions('RECALCULATE_LEDGER')
    recalculateLedgers(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
        @Query('chartOfAccountId') chartOfAccountId?: string,
    ) {
        const user = req.user as TenantRequestUser;
        return this.transactionService.recalculateBusinessLedgers(
            tenantDb,
            user.businessId,
            chartOfAccountId,
            user.userId,
        );
    }

    /**
     * Backfill missing Inventory / Sales Revenue / COGS (+ AR/AP) journals
     * for approved GRN, purchase returns, delivery notes, and sale returns.
     * Stock is never touched. Default dryRun=true — apply needs confirm.
     */
    @Post('backfill-trading-ledger')
    @RequirePermissions('RECALCULATE_LEDGER')
    backfillTradingLedger(
        @TenantConnection() tenantDb: DataSource,
        @TenantCode() tenantCode: string,
        @Req() req: Request,
        @Body() dto: BackfillTradingLedgerDto,
    ) {
        const user = req.user as TenantRequestUser;
        return this.missingTradingLedgerBackfillService.startBackfill(
            tenantDb,
            tenantCode,
            user,
            dto ?? {},
        );
    }
}   