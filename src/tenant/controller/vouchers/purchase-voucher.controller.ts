import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  MethodNotAllowedException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import {
  TenantCode,
  TenantConnection,
} from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import { PurchaseVoucherService } from '../../service/vouchers/purchase-voucher.service';
import {
  CreatePurchaseVouchersDto,
  UpdatePurchaseVoucherDto,
} from '../../dto/voucher/purchase-voucher.dto';

@Controller('tenant/purchase-vouchers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PurchaseVoucherController {
  constructor(private readonly purchaseVoucherService: PurchaseVoucherService) {}

  @Post('import')
  @RequirePermissions('CREATE_PURCHASE_VOUCHER')
  @UseInterceptors(FileInterceptor('file'))
  importPurchaseVouchers(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.importPurchaseVouchers(
      tenantDb,
      file,
      { userId: user.userId, businessId: user.businessId! },
      tenantCode,
    );
  }

  @Get('import')
  importPurchaseVouchersMethodNotAllowed() {
    throw new MethodNotAllowedException(
      'Use POST /tenant/purchase-vouchers/import with multipart form-data: file (CSV/XLS/XLSX).',
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_PURCHASE_VOUCHER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseVouchersDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.create(
      tenantDb,
      user.businessId!,
      dto.vouchers,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_PURCHASE_VOUCHER')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseVouchersDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.createAndApprove(
      tenantDb,
      user.businessId!,
      dto.vouchers,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PURCHASE_VOUCHER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: VoucherStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.list(
      tenantDb,
      user.businessId!,
      { page: Number(page), limit: Number(limit), search, status },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_VOUCHER')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.getById(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PURCHASE_VOUCHER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseVoucherDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.edit(
      tenantDb,
      user.businessId!,
      id,
      dto,
      user.userId,
    );
  }

  @Put('update-approved/:id')
  @RequirePermissions('EDIT_APPROVED_PURCHASE_VOUCHER')
  editApproved(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseVoucherDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.editApproved(
      tenantDb,
      user.businessId!,
      id,
      dto,
      user.userId,
    );
  }

  @Put('approve/:id')
  @RequirePermissions('APPROVE_PURCHASE_VOUCHER')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.approve(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }

  @Put('cancel/:id')
  @RequirePermissions('CANCEL_PURCHASE_VOUCHER')
  cancel(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.cancel(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_VOUCHER')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseVoucherService.delete(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }
}
