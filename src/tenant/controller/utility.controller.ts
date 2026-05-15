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

    @Get('designations')
    async getDesignations(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getDesignations(tenantDb);
    }

    @Get('roles')
    async getRoles(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRoles(tenantDb);
    }

    @Get('permissions')
    async getPermissions(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getPermissions(tenantDb);
    }

    @Get('regions')
    async getRegions(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRegions(tenantDb);
    }

    @Get('regions/:cityId')
    async getRegionsByCityId(@TenantConnection() tenantDb: DataSource, @Param('cityId') cityId: string) {
        return this.utilityService.getRegionsByCityId(tenantDb, cityId);
    }

    @Get('areas/:regionId')
    async getAreas(@TenantConnection() tenantDb: DataSource, @Param('regionId') regionId: string) {
        return this.utilityService.getAreas(tenantDb, regionId);
    }

    @Get('distributors')
    async getDistributors(@TenantConnection() tenantDb: DataSource, @Query('areaId') areaId?: string) {
        return this.utilityService.getDistributors(tenantDb, areaId);
    }

    @Get('product-categories')
    async getProductCategories(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getProductCategories(tenantDb);
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

    @Get('retailer-categories')
    async getRetailerCategories(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRetailerCategories(tenantDb);
    }

    @Get('retailer-channels')
    async getRetailerChannels(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRetailerChannels(tenantDb);
    }

    @Get('product-list')
    async getProductList(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getProductList(tenantDb);
    }

    @Get('routes')
    async getRoutes(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRoutes(tenantDb);
    }

    @Get('salesman-users')
    async getSalesmanUsers(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getSalesmanUsers(tenantDb);
    }

    @Get('merchandiser-users')
    async getMerchandiserUsers(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getMerchandiserUsers(tenantDb);
    }

    @Get('pjps-by-user-id/:userId')
    async getPJPsByUserId(@TenantConnection() tenantDb: DataSource, @Param('userId') userId: string) {
        return this.utilityService.getPJPsByUserId(tenantDb, userId);
    }

    @Get('routes-by-user-id/:userId')
    async getRoutesByUserId(@TenantConnection() tenantDb: DataSource, @Param('userId') userId: string) {
        return this.utilityService.getRoutesByUserId(tenantDb, userId);
    }

    @Get('retailers')
    async getRetailers(@TenantConnection() tenantDb: DataSource,) {
        return this.utilityService.getRetailers(tenantDb);
    }
}