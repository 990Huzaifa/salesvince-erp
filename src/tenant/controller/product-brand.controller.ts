import { Body, Controller, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ProductBrandService } from '../service/product-brand.service';
import { CreateProductBrandDto } from '../dto/product-brand/create-product-brand.dto';
import { UpdateProductBrandDto } from '../dto/product-brand/update-product-brand.dto';

@Controller('tenant/product-brands')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProductBrandController {
  constructor(private readonly productBrandService: ProductBrandService) {}

  @Post('create')
  @RequirePermissions('CREATE_PRODUCT_BRAND')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateProductBrandDto,
    @Req() req: Request,
  ) {
    return this.productBrandService.create(tenantDb, dto, req.user);
  }

  @Post('import')
  @RequirePermissions('CREATE_PRODUCT_BRAND')
  @UseInterceptors(FileInterceptor('file'))
  importBrands(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.productBrandService.importBrands(tenantDb, file, req.user, tenantCode);
  }

  @Get()
  @RequirePermissions('LIST_PRODUCT_BRAND')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.productBrandService.list(tenantDb, page, limit, search, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PRODUCT_BRAND')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.productBrandService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PRODUCT_BRAND')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateProductBrandDto,
    @Req() req: Request,
  ) {
    return this.productBrandService.edit(tenantDb, id, dto, req.user);
  }
}
