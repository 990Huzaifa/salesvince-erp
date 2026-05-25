import { BadRequestException, Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";
import { TenantConnection } from "src/common/tenant/tenant-connection.decorator";
import { DataSource } from "typeorm";
import { TenantUtilityService } from "../service/tenant-utility.service";
import type { TenantRequestUser } from "src/auth/tenant-jwt.strategy";
import { TenantBusinessAccessGuard } from "src/auth/tenant-business-access.guard";

@Controller('tenant/lists')

export class TenantUtilityController {
    constructor(private readonly utilityService: TenantUtilityService) {}

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
    )
    @Get('roles')
    async getRoles(@TenantConnection() tenantDb: DataSource) {
        return this.utilityService.getRoles(tenantDb);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
    )
    @Get('permissions')
    async getPermissions(@TenantConnection() tenantDb: DataSource) {
        return this.utilityService.getPermissions(tenantDb);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('product-categories')
    async getProductCategories(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getProductCategories(tenantDb, user.businessId);
    }


    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('product-sub-categories')
    async getProductSubCategories(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getProductSubCategories(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('product-brands')
    async getProductBrands(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getProductBrands(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('flavours')
    async getFlavours(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getFlavours(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('uoms')
    async uoms(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.uoms(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('product-list')
    async getProductList(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getProductList(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('stock-products')
    async getStockProducts(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getStockProducts(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
    )
    @Get('account-types')
    async getAccountTypes(@TenantConnection() tenantDb: DataSource) {
        return this.utilityService.getAccountTypes(tenantDb);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('accounts-list')
    async getAccountList(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
        @Query('parentCode') parentCode: string,
    ) {
        if (!parentCode) {
            throw new BadRequestException('Parent code is required');
        }
        const user = req.user as TenantRequestUser;
        return this.utilityService.getAccountList(tenantDb, parentCode, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('vendors')
    async getVendors(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getVendors(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('customers')
    async getCustomers(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getCustomers(tenantDb, user.businessId);
    }
}
