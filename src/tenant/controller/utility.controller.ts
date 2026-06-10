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
import { ComponentTypeEnum } from 'src/tenant-db/entities/hr/hr.enums';

@Controller('tenant/lists')

export class TenantUtilityController {
    constructor(private readonly utilityService: TenantUtilityService) {}

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('master')
    async getMasterUtilityData(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getAllUtilityData(tenantDb, user.businessId);
    }

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
    )
    @Get('businesses')
    async getBusinesses(@TenantConnection() tenantDb: DataSource) {
        return this.utilityService.getBusinesses(tenantDb);
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
        @Query('categoryId') categoryId?: string,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getProductSubCategories(tenantDb, user.businessId, categoryId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('approved-sale-orders')
    async getApprovedSaleOrders(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getApprovedSaleOrders(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('purchase-orders')
    async getPurchaseOrders(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getPurchaseOrders(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('sale-orders')
    async getSaleOrders(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getSaleOrders(tenantDb, user.businessId);
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
    @Get('warehouse-list')
    async getWarehouseList(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getWarehouseList(tenantDb, user.businessId);
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
        @Query('warehouseId') warehouseId?: string,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getStockProducts(
            tenantDb,
            user.businessId,
            warehouseId,
        );
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

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('sale-invoices')
    async getSaleInvoices(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getSaleInvoices(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('purchase-invoices')
    async getPurchaseInvoices(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getPurchaseInvoices(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
    )
    @Get('hr-enums')
    getHrEnums() {
        return { result: this.utilityService.getHrEnums() };
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('departments')
    getDepartments(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getDepartments(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('designations')
    getDesignations(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getDesignations(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('employees')
    getEmployees(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getEmployees(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('pay-policies')
    getPayPolicies(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getPayPolicies(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('salary-components')
    getSalaryComponents(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
        @Query('componentType') componentType?: ComponentTypeEnum,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getSalaryComponents(
            tenantDb,
            user.businessId,
            componentType,
        );
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('payslip')
    getPayslips(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getPayslip(tenantDb, user.businessId);
    }

    @UseGuards(
        TenantJwtAuthGuard,
        TenantJwtGuard,
        TenantConnectionGuard,
        TenantBusinessAccessGuard,
    )
    @Get('loans')
    getLoans(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
    ) {
        const user = req.user as TenantRequestUser;
        return this.utilityService.getLoans(tenantDb, user.businessId);
    }
}
