import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection, TenantId } from 'src/common/tenant/tenant-connection.decorator';
import { CreateAssetUploadRequestDto } from '../dto/asset/create-asset-upload-request.dto';
import { ConfirmAssetUploadDto } from '../dto/asset/confirm-asset-upload.dto';
import { AssetService } from '../service/asset.service';

@Controller('tenant/assets')
@UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantPermissionGuard,
)
export class AssetController {
    constructor(private readonly assetService: AssetService) { }

    @Post('upload-requests')
    @RequirePermissions('UPLOAD_ASSET')
    createUploadRequests(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
        @Body() dto: CreateAssetUploadRequestDto,
        @TenantId() tenantId: string,
        @TenantCode() tenantCode: string
    ) {
        return this.assetService.createUploadRequests(
            tenantDb,
            tenantId,
            tenantCode,
            dto,
            req.user,
        );
    }

    @Post('confirm-uploads')
    @RequirePermissions('UPLOAD_ASSET')
    confirmUploads(
        @TenantConnection() tenantDb: DataSource,
        @Req() req: Request,
        @Body() dto: ConfirmAssetUploadDto,
        @TenantId() tenantId: string,
        @TenantCode() tenantCode: string
    ) {
        return this.assetService.confirmUploads(
            tenantDb,
            tenantId,
            tenantCode,
            dto,
            req.user,
        );
    }
}
