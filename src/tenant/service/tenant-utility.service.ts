import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Flavour, Product, ProductBrand, ProductCategory, ProductSubCategory, Uom } from 'src/tenant-db/entities/product.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';

@Injectable()
export class TenantUtilityService {

  async getRoles(tenantDb: DataSource) {
  const roles = await tenantDb.getRepository(Role).find({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
    },
    order: { name: 'ASC' },
  });
  // remove permissions array from roles
  return { result: roles };
  }

  async getPermissions(tenantDb: DataSource) {
    const permissions = await tenantDb.getRepository(Permission).find({
      select: ['id', 'key', 'name'],
      order: { name: 'ASC' },
    });

    return { result: permissions };
  }

  async getProductCategories(tenantDb: DataSource, businessId: string) {
    const productCategories = await tenantDb.getRepository(ProductCategory).find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productCategories };
  }

  async getProductSubCategories(tenantDb: DataSource, businessId: string) {
    const productSubCategories = await tenantDb.getRepository(ProductSubCategory).find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productSubCategories };
  }

  async getProductBrands(tenantDb: DataSource, businessId: string) {
    const productBrands = await tenantDb.getRepository(ProductBrand).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productBrands };
  }

  async getProductList(tenantDb: DataSource, businessId: string) {
    const productList = await tenantDb.getRepository(Product).find({
      select: {
        id: true,
        name: true,
        skuCode: true,
      },
      relations: {
        pricing: {
          uom: true,
        },
        flavours: true,
      },
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: productList };
  }

  async getFlavours(tenantDb: DataSource) {
    const flavours = await tenantDb.getRepository(Flavour).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return { result: flavours };
  }

  async uoms(tenantDb: DataSource, businessId: string) {
    const uoms = await tenantDb.getRepository(Uom).find({
      select: ['id', 'name', 'isBase'],
      where: { isBase: false, businessId: businessId },
      order: { name: 'ASC' },
    });

    return { result: uoms };
  }

  async warehouses(tenantDb: DataSource, businessId: string) {
    const warehouses = await tenantDb.getRepository(Warehouse).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
      where: { businessId: businessId },
    });

    return { result: warehouses };
  }

}
