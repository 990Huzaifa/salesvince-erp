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
import { OpeningStockStatus } from 'src/tenant-db/entities/opening-stock.entity';
import { OpeningStockService } from '../service/inventory/opening-stock.service';
import { CreateOpeningStockDto } from '../dto/opening-stock/create-opening-stock.dto';
import { UpdateOpeningStockDto } from '../dto/opening-stock/update-opening-stock.dto';

@Controller('tenant/opening-stocks')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class OpeningStockController {
  constructor(private readonly openingStockService: OpeningStockService) {}

  @Post('create')
  @RequirePermissions('CREATE_OPENING_STOCK')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateOpeningStockDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_OPENING_STOCK')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateOpeningStockDto,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.createAndApprove(
      tenantDb,
      user.businessId,
      dto,
      user,
      tenantCode,
    );
  }

  @Post('import')
  @RequirePermissions('CREATE_OPENING_STOCK')
  @UseInterceptors(FileInterceptor('file'))
  import(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.importOpeningStock(
      tenantDb,
      file,
      user,
      tenantCode,
    );
  }

  @Get()
  @RequirePermissions('LIST_OPENING_STOCK')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: OpeningStockStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.list(
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

  @Get(':id')
  @RequirePermissions('VIEW_OPENING_STOCK')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_OPENING_STOCK')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpeningStockDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_OPENING_STOCK')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_OPENING_STOCK')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.approve(
      tenantDb,
      user.businessId,
      id,
      user,
      tenantCode,
    );
  }

  @Post('reject/:id')
  @RequirePermissions('REJECT_OPENING_STOCK')
  reject(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.openingStockService.reject(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
