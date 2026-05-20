import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { TenantJwtAuthGuard } from "src/auth/tenant-jwt-auth.guard";
import { TenantConnectionGuard } from "src/common/guards/tenant-connection.guard";
import { TenantJwtGuard } from "src/common/guards/tenant-jwt.guard";
import { TenantConnection } from "src/common/tenant/tenant-connection.decorator";
import { DataSource } from "typeorm";
import { TenantUtilityService } from "../service/tenant-utility.service";

@Controller('tenant/lists')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
export class TenantUtilityController {
    constructor(private readonly utilityService: TenantUtilityService) {}

    @Get('roles')
    async getRoles(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRoles(tenantDb);
    }

    @Get('permissions')
    async getPermissions(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getPermissions(tenantDb);
    }

    @Get('product-categories')
    async getProductCategories(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getProductCategories(tenantDb);
    }

    @Get('product-sub-categories')
    async getProductSubCategories(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getProductSubCategories(tenantDb);
    }

    @Get('product-brands')
    async getProductBrands(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getProductBrands(tenantDb);
    }

    @Get('flavours')
    async getFlavours(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getFlavours(tenantDb);
    }

    @Get('uoms')
    async uoms(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.uoms(tenantDb);
    }

    @Get('product-list')
    async getProductList(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getProductList(tenantDb);
    }
}