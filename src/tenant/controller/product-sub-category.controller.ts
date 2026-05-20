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
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { ProductSubCategoryService } from '../service/product-sub-category.service';
import { CreateProductSubCategoryDto } from '../dto/product-sub-category/create-product-sub-category.dto';
import { UpdateProductSubCategoryDto } from '../dto/product-sub-category/update-product-sub-category.dto';

@Controller('tenant/product-sub-categories')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class ProductSubCategoryController {
  constructor(
    private readonly productSubCategoryService: ProductSubCategoryService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_PRODUCT_SUB_CATEGORY')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateProductSubCategoryDto,
    @Req() req: Request,
  ) {
    return this.productSubCategoryService.create(tenantDb, dto, req.user);
  }

  @Post('import')
  @RequirePermissions('CREATE_PRODUCT_SUB_CATEGORY')
  @UseInterceptors(FileInterceptor('file'))
  importSubCategories(
    @TenantConnection() tenantDb: DataSource,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    return this.productSubCategoryService.importSubCategories(
      tenantDb,
      file,
      req.user,
      tenantCode,
    );
  }

  @Get()
  @RequirePermissions('LIST_PRODUCT_SUB_CATEGORY')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Query('categoryId') categoryId: string | undefined,
    @Req() req: Request,
  ) {
    return this.productSubCategoryService.list(
      tenantDb,
      page,
      limit,
      search,
      categoryId,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PRODUCT_SUB_CATEGORY')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.productSubCategoryService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PRODUCT_SUB_CATEGORY')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateProductSubCategoryDto,
    @Req() req: Request,
  ) {
    return this.productSubCategoryService.edit(tenantDb, id, dto, req.user);
  }
}
