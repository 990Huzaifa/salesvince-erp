import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { DeliveryNoteStatus } from 'src/tenant-db/entities/delivery-note.entity';
import { DeliveryNoteService } from '../../service/sale/delivery-note.service';
import { CreateDeliveryNoteDto } from '../../dto/delivery-note/create-delivery-note.dto';

@Controller('tenant/delivery-notes')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class DeliveryNoteController {
  constructor(private readonly deliveryNoteService: DeliveryNoteService) {}

  @Post('create')
  @RequirePermissions('CREATE_DELIVERY_NOTE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateDeliveryNoteDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.deliveryNoteService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_DELIVERY_NOTE')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateDeliveryNoteDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.deliveryNoteService.create(
      tenantDb,
      user.businessId,
      { ...dto, status: DeliveryNoteStatus.APPROVED },
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_DELIVERY_NOTE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('saleOrderId') saleOrderId?: string,
    @Query('status') status?: DeliveryNoteStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.deliveryNoteService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        customerId,
        saleOrderId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_DELIVERY_NOTE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.deliveryNoteService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_DELIVERY_NOTE')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.deliveryNoteService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
