import { TenantBusinessAccessGuard } from "src/auth/tenant-business-access.guard";
import { TenantConnection } from "src/common/tenant/tenant-connection.decorator";
import { DataSource } from "typeorm";
import { Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { TenantPermissionGuard } from "src/auth/tenant-permission.guard";
import { TenantRequestUser } from "src/auth/tenant-jwt.strategy";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";
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
    constructor(private readonly transactionService: TransactionService) { }

    @Get('')
    async listTransactions(@TenantConnection() tenantDb: DataSource, @Req() req: Request, @Query('page') page: number = 1, @Query('limit') limit: number = 10, @Query('search') search: string = '') {
        const user = req.user as TenantRequestUser;
        return this.transactionService.listTransactions(tenantDb, user.businessId, {
            page: page,
            limit: limit,
            search: search,
        }, user.userId);
    }

    @Post('recalculate')
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
}   