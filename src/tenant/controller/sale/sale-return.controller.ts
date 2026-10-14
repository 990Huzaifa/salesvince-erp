import {
  BadRequestException,
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
import { SaleReturnStatus } from 'src/tenant-db/entities/sale-return.entity';
import { SaleReturnService } from '../../service/sale/sale-return.service';
import { CreateSaleReturnDto } from '../../dto/sale-return/create-sale-return.dto';
import { UpdateSaleReturnDto } from '../../dto/sale-return/update-sale-return.dto';
import { BulkApproveSaleReturnsDto } from '../../dto/sale-return/bulk-approve-sale-returns.dto';
import { jsonImportUploadOptions } from '../../config/json-import-upload.config';

@Controller('tenant/sale-returns')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleReturnController {
  constructor(private readonly saleReturnService: SaleReturnService) {}

  @Post('create')
  @RequirePermissions('CREATE_SALE_RETURN')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_SALE_RETURN')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.createAndApprove(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get('export')
  @RequirePermissions('LIST_SALE_RETURN')
  exportSaleReturnsJson(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.exportSaleReturnsJson(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Post('import-json')
  @RequirePermissions('CREATE_SALE_RETURN')
  @UseInterceptors(FileInterceptor('file', jsonImportUploadOptions))
  importSaleReturnsJson(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Body('mode') mode: string | undefined,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'JSON file is required. Use multipart form-data field "file".',
      );
    }
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.importSaleReturnsJson(
      tenantDb,
      file,
      { userId: user.userId, businessId: user.businessId },
      tenantCode,
      mode,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALE_RETURN')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('saleInvoiceId') saleInvoiceId?: string,
    @Query('status') status?: SaleReturnStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        saleInvoiceId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_RETURN')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('bulk-approve')
  @RequirePermissions('APPROVE_SALE_RETURN')
  bulkApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: BulkApproveSaleReturnsDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.bulkApprove(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_SALE_RETURN')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('reject/:id')
  @RequirePermissions('REJECT_SALE_RETURN')
  reject(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.reject(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_RETURN')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SALE_RETURN')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
