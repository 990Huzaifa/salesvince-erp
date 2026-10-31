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
import { getClientIp, sendPdf } from 'src/common/pdf';
import { StockTransferStatus } from 'src/tenant-db/entities/stock-transfer.entity';
import { StockTransferService } from '../service/inventory/stock-transfer.service';
import { WarehouseSlipPdfService } from '../service/warehouse-slip-pdf.service';
import { CreateStockTransferDto } from '../dto/stock-transfer/create-stock-transfer.dto';
import { UpdateStockTransferDto } from '../dto/stock-transfer/update-stock-transfer.dto';

@Controller('tenant/stock-transfers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class StockTransferController {
  constructor(
    private readonly stockTransferService: StockTransferService,
    private readonly warehouseSlipPdfService: WarehouseSlipPdfService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_TRANSFER_STOCK')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateStockTransferDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_TRANSFER_STOCK')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateStockTransferDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.create(
      tenantDb,
      user.businessId,
      { ...dto, status: StockTransferStatus.APPROVED },
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_TRANSFER_STOCK')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('fromWarehouseId') fromWarehouseId?: string,
    @Query('toWarehouseId') toWarehouseId?: string,
    @Query('status') status?: StockTransferStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        fromWarehouseId,
        toWarehouseId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id/warehouse-slip/pdf')
  @RequirePermissions('VIEW_TRANSFER_STOCK')
  async downloadWarehouseSlipPdf(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as TenantRequestUser;
    const { buffer, filename } =
      await this.warehouseSlipPdfService.generateForStockTransfer(
        tenantDb,
        user.businessId,
        id,
        user.userId,
        user.tenantId,
        getClientIp(req),
      );
    sendPdf(res, { buffer, filename });
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRANSFER_STOCK')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_TRANSFER_STOCK')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockTransferDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TRANSFER_STOCK')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_TRANSFER_STOCK')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('reject/:id')
  @RequirePermissions('REJECT_TRANSFER_STOCK')
  reject(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.stockTransferService.reject(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}

