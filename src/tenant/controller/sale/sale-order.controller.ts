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
import { OrderStatus } from 'src/tenant-db/entities/sale-order.entity';
import { SaleOrderService } from '../../service/sale/sale-order.service';
import { SaleOrderReverseService } from '../../service/sale/sale-order-reverse.service';
import { CreateSaleOrderDto } from '../../dto/sale-order/create-sale-order.dto';
import { UpdateSaleOrderDto } from '../../dto/sale-order/update-sale-order.dto';
import { EditApprovedSaleOrderDto } from '../../dto/sale-order/edit-approved-sale-order.dto';

@Controller('tenant/sale-orders')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleOrderController {
  constructor(
    private readonly saleOrderService: SaleOrderService,
    private readonly saleOrderReverseService: SaleOrderReverseService,
  ) {}

  @Post('import')
  @RequirePermissions('CREATE_SALE_ORDER')
  @UseInterceptors(FileInterceptor('file'))
  importSaleOrders(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.importSaleOrders(
      tenantDb,
      file,
      { userId: user.userId, businessId: user.businessId },
      tenantCode,
    );
  }

  @Post('import-items')
  @RequirePermissions('CREATE_SALE_ORDER')
  @UseInterceptors(FileInterceptor('file'))
  importSaleOrderItems(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.importSaleOrderItems(
      tenantDb,
      file,
      { userId: user.userId, businessId: user.businessId },
      tenantCode,
    );
  }

  @Get('import-items')
  importSaleOrderItemsMethodNotAllowed() {
    throw new MethodNotAllowedException(
      'Use POST /tenant/sale-orders/import-items with multipart form-data: file (CSV/XLS/XLSX).',
    );
  }

  @Get('import')
  importSaleOrdersMethodNotAllowed() {
    throw new MethodNotAllowedException(
      'Use POST /tenant/sale-orders/import with multipart form-data: file (CSV/XLS/XLSX).',
    );
  }

  @Post('create')
  @RequirePermissions('CREATE_SALE_ORDER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_SALE_ORDER')
  createAndApproved(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.createAndApproved(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-approve-and-sale')
  @RequirePermissions('APPROVE_SALE_ORDER')
  createApproveAndSale(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.createApproveAndSale(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALE_ORDER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('orderStatus') orderStatus?: OrderStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        customerId,
        orderStatus,
      },
      user.userId,
    );
  }

  @Get('product-sale-history')
  @RequirePermissions('VIEW_SALE_ORDER')
  getProductSaleHistory(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('partyId') partyId?: string,
    @Query('customerId') customerId?: string,
    @Query('productId') productId?: string,
    @Query('uomId') uomId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.getProductSaleHistory(
      tenantDb,
      user.businessId,
      {
        partyId: partyId ?? customerId,
        productId,
        uomId,
      },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_ORDER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_ORDER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Put('edit-approved/:id')
  @RequirePermissions('UPDATE_SALE_ORDER')
  editApproved(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditApprovedSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.editApproved(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SALE_ORDER')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('reverse/:id')
  @RequirePermissions('REVERSE_SALE_ORDER')
  reverse(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderReverseService.reverse(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_SALE_ORDER')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('reject/:id')
  @RequirePermissions('REJECT_SALE_ORDER')
  reject(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.reject(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
