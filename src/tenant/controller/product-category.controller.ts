import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ProductCategoryService } from '../service/product-category.service';
import { CreateProductCategoryDto } from '../dto/product-category/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/product-category/update-product-category.dto';

@Controller('tenant/product-categories')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProductCategoryController {
  constructor(private readonly productCategoryService: ProductCategoryService) {}

  @Post('create')
  @RequirePermissions('CREATE_PRODUCT_CATEGORY')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateProductCategoryDto,
    @Req() req: Request,
  ) {
    return this.productCategoryService.create(tenantDb, dto, req.user);
  }

  @Post('import')
  @RequirePermissions('CREATE_PRODUCT_CATEGORY')
  @UseInterceptors(FileInterceptor('file'))
  importCategories(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.productCategoryService.importCategories(tenantDb, file, req.user, tenantCode);
  }

  @Get()
  @RequirePermissions('LIST_PRODUCT_CATEGORY')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.productCategoryService.list(tenantDb, page, limit, search, req.user);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PRODUCT_CATEGORY')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.productCategoryService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PRODUCT_CATEGORY')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
    @Req() req: Request,
  ) {
    return this.productCategoryService.edit(tenantDb, id, dto, req.user);
  }
}
