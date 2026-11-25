import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { StockAdjustmentStatus } from 'src/tenant-db/entities/stock-adjustment.entity';
import { StockAdjustmentService } from '../service/inventory/stock-adjustment.service';
import { WarehouseSlipPdfService } from '../service/warehouse-slip-pdf.service';
import { CreateStockAdjustmentDto } from '../dto/stock-adjustment/create-stock-adjustment.dto';
import { UpdateStockAdjustmentDto } from '../dto/stock-adjustment/update-stock-adjustment.dto';
import { getClientIp, sendPdf } from 'src/common/pdf';

@Controller('tenant/stock-adjustments')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class StockAdjustmentController {
  constructor(
    private readonly stockAdjustmentService: StockAdjustmentService,
    private readonly warehouseSlipPdfService: WarehouseSlipPdfService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_ADJUSTMENT_STOCK')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateStockAdjustmentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_ADJUSTMENT_STOCK')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateStockAdjustmentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.create(
      tenantDb,
      user.businessId,
      { ...dto, status: StockAdjustmentStatus.APPROVED },
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_ADJUSTMENT_STOCK')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: StockAdjustmentStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        warehouseId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id/warehouse-slip/pdf')
  @RequirePermissions('VIEW_ADJUSTMENT_STOCK')
  async downloadWarehouseSlipPdf(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as TenantRequestUser;
    const { buffer, filename } =
      await this.warehouseSlipPdfService.generateForStockAdjustment(
        tenantDb,
        user.businessId,
        id,
        user.userId,
        user.tenantId,
        getClientIp(req),
        user.tenantName,
      );
    sendPdf(res, { buffer, filename });
  }

  @Get(':id')
  @RequirePermissions('VIEW_ADJUSTMENT_STOCK')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_ADJUSTMENT_STOCK')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockAdjustmentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_ADJUSTMENT_STOCK')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_ADJUSTMENT_STOCK')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('reject/:id')
  @RequirePermissions('REJECT_ADJUSTMENT_STOCK')
  reject(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockAdjustmentService.reject(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
