import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  Tenant,
  TenantStatus,
} from 'src/master-db/entities/tenant.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
} from 'src/tenant-db/entities/purchase-invoice.entity';
import { PurchaseOrder } from 'src/tenant-db/entities/purchase-order.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleItemType } from 'src/tenant-db/entities/sale-item-type';
import { SaleOrder } from 'src/tenant-db/entities/sale-order.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';

type PublicBusiness = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  logo: string | null;
  currency: string;
  phone: string | null;
  address: string | null;
};

type PublicParty = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  ntnNumber: string | null;
  strnNumber: string | null;
};

@Injectable()
export class PublicDocumentViewService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly tenantConnectionManager: TenantConnectionManager,
  ) {}

  async getSaleOrder(tenantHost: string | undefined, id: string) {
    const { tenant, tenantDb } = await this.resolveTenantDb(tenantHost);
    const order = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('so.id = :id', { id })
      .getOne();

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    const business = await this.loadBusiness(tenantDb, order.businessId);
    return {
      documentType: 'SALE_ORDER' as const,
      tenant: { code: tenant.code, name: tenant.name },
      business,
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        orderDate: order.orderDate,
        notes: order.notes,
        orderTotal: Number(order.orderTotal ?? 0),
        deliveryCost: Number(order.deliveryCost ?? 0),
        taxPercentage: Number(order.taxPercentage ?? 0),
        taxAmount: Number(order.taxAmount ?? 0),
        discountPercentage: Number(order.discountPercentage ?? 0),
        discountAmount: Number(order.discountAmount ?? 0),
        totalAmount: Number(order.totalAmount ?? 0),
        customer: this.mapParty(order.customer),
        items: (order.items ?? []).map((item) => ({
          id: item.id,
          itemType: item.itemType ?? SaleItemType.PRODUCT,
          product: item.product
            ? {
                name: item.product.name,
                skuCode: item.product.skuCode,
              }
            : null,
          service: item.service
            ? {
                code: item.service.code,
                name: item.service.name,
              }
            : null,
          flavour: item.productFlavour?.flavour?.name ?? null,
          unit: item.uom?.name ?? null,
          quantity: Number(item.quantity ?? 0),
          rate: Number(item.saleUnitPrice ?? 0),
          discountPercentage: Number(item.discountPercentage ?? 0),
          discountAmount: Number(item.discountAmount ?? 0),
          totalAmount: Number(item.totalAmount ?? 0),
        })),
      },
    };
  }

  async getSaleInvoice(tenantHost: string | undefined, id: string) {
    const { tenant, tenantDb } = await this.resolveTenantDb(tenantHost);
    const invoice = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('invoice.id = :id', { id })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }

    const business = await this.loadBusiness(tenantDb, invoice.businessId);
    return {
      documentType: 'SALE_INVOICE' as const,
      tenant: { code: tenant.code, name: tenant.name },
      business,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        saleOrderNumber: invoice.saleOrder?.orderNumber ?? null,
        totalTaxAmount: Number(invoice.totalTaxAmount ?? 0),
        totalDiscountAmount: Number(invoice.totalDiscountAmount ?? 0),
        totalAmount: Number(invoice.totalAmount ?? 0),
        customer: this.mapParty(invoice.customer),
        items: (invoice.items ?? [])
          .filter((item: SaleInvoiceItem) => !item.deletedAt)
          .map((item) => ({
            id: item.id,
            itemType: item.itemType ?? SaleItemType.PRODUCT,
            product: item.product
              ? {
                  name: item.product.name,
                  skuCode: item.product.skuCode,
                }
              : null,
            service: item.service
              ? {
                  code: item.service.code,
                  name: item.service.name,
                }
              : null,
            flavour: item.productFlavour?.flavour?.name ?? null,
            unit: item.uom?.name ?? null,
            quantity: Number(item.quantity ?? 0),
            rate: Number(item.saleUnitPrice ?? 0),
            discountPercentage: Number(item.discountPercentage ?? 0),
            discountAmount: Number(item.discountAmount ?? 0),
            taxPercentage: Number(item.taxPercentage ?? 0),
            taxAmount: Number(item.taxAmount ?? 0),
            totalAmount: Number(item.totalAmount ?? 0),
          })),
      },
    };
  }

  async getPurchaseOrder(tenantHost: string | undefined, id: string) {
    const { tenant, tenantDb } = await this.resolveTenantDb(tenantHost);
    const order = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('po.warehouse', 'warehouse')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('po.id = :id', { id })
      .getOne();

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    const business = await this.loadBusiness(tenantDb, order.businessId);
    return {
      documentType: 'PURCHASE_ORDER' as const,
      tenant: { code: tenant.code, name: tenant.name },
      business,
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        orderDate: order.orderDate,
        notes: order.notes,
        warehouse: order.warehouse
          ? {
              code: order.warehouse.code,
              name: order.warehouse.name,
            }
          : null,
        orderTotal: Number(order.orderTotal ?? 0),
        deliveryCost: Number(order.deliveryCost ?? 0),
        taxPercentage: Number(order.taxPercentage ?? 0),
        taxAmount: Number(order.taxAmount ?? 0),
        discountPercentage: Number(order.discountPercentage ?? 0),
        discountAmount: Number(order.discountAmount ?? 0),
        totalAmount: Number(order.totalAmount ?? 0),
        vendor: this.mapParty(order.vendor),
        items: (order.items ?? []).map((item) => ({
          id: item.id,
          product: item.product
            ? {
                name: item.product.name,
                skuCode: item.product.skuCode,
              }
            : null,
          flavour: item.productFlavour?.flavour?.name ?? null,
          unit: item.uom?.name ?? null,
          quantity: Number(item.quantity ?? 0),
          rate: Number(item.purchaseUnitPrice ?? 0),
          discountPercentage: Number(item.discountPercentage ?? 0),
          discountAmount: Number(item.discountAmount ?? 0),
          totalAmount: Number(item.totalAmount ?? 0),
        })),
      },
    };
  }

  async getPurchaseInvoice(tenantHost: string | undefined, id: string) {
    const { tenant, tenantDb } = await this.resolveTenantDb(tenantHost);
    const invoice = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .leftJoinAndSelect('invoice.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('invoice.id = :id', { id })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    const business = await this.loadBusiness(tenantDb, invoice.businessId);
    return {
      documentType: 'PURCHASE_INVOICE' as const,
      tenant: { code: tenant.code, name: tenant.name },
      business,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        purchaseOrderNumber: invoice.purchaseOrder?.orderNumber ?? null,
        totalTaxAmount: Number(invoice.totalTaxAmount ?? 0),
        totalDiscountAmount: Number(invoice.totalDiscountAmount ?? 0),
        totalAmount: Number(invoice.totalAmount ?? 0),
        vendor: this.mapParty(invoice.vendor),
        items: (invoice.items ?? [])
          .filter((item: PurchaseInvoiceItem) => !item.deletedAt)
          .map((item) => ({
            id: item.id,
            product: item.product
              ? {
                  name: item.product.name,
                  skuCode: item.product.skuCode,
                }
              : null,
            flavour: item.productFlavour?.flavour?.name ?? null,
            unit: item.uom?.name ?? null,
            quantity: Number(item.quantity ?? 0),
            rate: Number(item.purchaseUnitPrice ?? 0),
            discountPercentage: Number(item.discountPercentage ?? 0),
            discountAmount: Number(item.discountAmount ?? 0),
            taxPercentage: Number(item.taxPercentage ?? 0),
            taxAmount: Number(item.taxAmount ?? 0),
            totalAmount: Number(item.totalAmount ?? 0),
          })),
      },
    };
  }

  private async resolveTenantDb(tenantHost: string | undefined) {
    const tenantName = this.extractTenantName(tenantHost);
    if (!tenantName) {
      throw new NotFoundException('Tenant not found');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { name: tenantName, isActive: true },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (tenant.status !== TenantStatus.PROVISIONED) {
      throw new ForbiddenException(
        `Tenant is not available (status: ${tenant.status})`,
      );
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(
      tenant.id,
    );
    return { tenant, tenantDb };
  }

  /** Same rules as tenant auth: `{name}.{DOMAIN}` or `{name}.localhost`. */
  private extractTenantName(host?: string): string | null {
    if (!host?.trim()) {
      return null;
    }
    const domain = (process.env.DOMAIN || '').toLowerCase();
    const h = host.trim().toLowerCase().split(':')[0];
    if (h.endsWith('.localhost')) {
      return h.split('.')[0] || null;
    }
    if (domain && h.endsWith(`.${domain}`)) {
      const sub = h.slice(0, -(domain.length + 1));
      return sub.split('.')[0] || null;
    }
    return null;
  }

  private async loadBusiness(
    tenantDb: DataSource,
    businessId: string,
  ): Promise<PublicBusiness> {
    const business = await tenantDb.getRepository(Business).findOne({
      where: { id: businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return {
      id: business.id,
      code: business.code,
      name: business.name,
      legalName: business.legalName,
      logo: business.logo,
      currency: business.currency,
      phone: business.phone,
      address: business.address,
    };
  }

  private mapParty(party?: Party | null): PublicParty | null {
    if (!party) {
      return null;
    }
    return {
      id: party.id,
      code: party.code,
      name: party.name,
      phone: party.phone,
      email: party.email,
      address: party.address,
      ntnNumber: party.ntnNumber,
      strnNumber: party.strnNumber,
    };
  }
}
