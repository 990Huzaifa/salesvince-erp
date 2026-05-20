import { DataSource } from 'typeorm';
import { Permission } from '../entities/permission.entity';

export const TENANT_PERMISSIONS = [
  { key: 'UPLOAD_ASSET', name: 'Upload Asset' },

  { key: 'CREATE_USER', name: 'Create Users' },
  { key: 'CREATE_ROLE', name: 'Create Role' },
  { key: 'CREATE_DESIGNATION', name: 'Create Designation' },
  { key: 'CREATE_PRODUCT_CATEGORY', name: 'Create Category' },
  { key: 'CREATE_PRODUCT_SUB_CATEGORY', name: 'Create Sub Category' },
  { key: 'CREATE_PRODUCT_BRAND', name: 'Create Brand' },
  { key: 'CREATE_PRODUCT', name: 'Create Product' },
  { key: 'CREATE_FLAVOUR', name: 'Create Flavour' },
  { key: 'CREATE_UOM', name: 'Create UOM' },
  { key: 'CREATE_SALE_ORDER', name: 'Create Sale Order' },
  { key: 'CREATE_SALE_INVOICE', name: 'Create Sale Invoice' },
  { key: 'CREATE_SALE_RETURN', name: 'Create Sale Return' },
  { key: 'CREATE_SALE_VOUCHER', name: 'Create Sale Voucher' },
  { key: 'CREATE_PURCHASE_VOUCHER', name: 'Create Purchase Voucher' },
  { key: 'CREATE_PURCHASE_RETURN_VOUCHER', name: 'Create Purchase Return Voucher' },
  { key: 'CREATE_SALE_RETURN_VOUCHER', name: 'Create Sale Return Voucher' },
  { key: 'CREATE_EXPENSE_VOUCHER', name: 'Create Expense Voucher' },
  { key: 'CREATE_CONTRA_VOUCHER', name: 'Create Contra Voucher' },
  { key: 'CREATE_OPENING_STOCK', name: 'Create Opening Stock' },
  { key: 'CREATE_PURCHASE_STOCK', name: 'Create Purchase Stock' },
  { key: 'CREATE_TRANSFER_STOCK', name: 'Create Transfer Stock' },
  { key: 'CREATE_CHART_OF_ACCOUNT', name: 'Create Chart of Account' },
  { key: 'CREATE_PARTY', name: 'Create Party' },
  { key: 'CREATE_PURCHASE_QUOTATION', name: 'Create Purchase Quotation' },

  { key: 'LIST_USER', name: 'List Users' },
  { key: 'LIST_ROLE', name: 'List Role' },
  { key: 'LIST_DESIGNATION', name: 'List Designation' },
  { key: 'LIST_DISTRIBUTOR', name: 'List Distributor' },
  { key: 'LIST_PRODUCT_CATEGORY', name: 'List Category' },
  { key: 'LIST_PRODUCT_SUB_CATEGORY', name: 'List Sub Category' },
  { key: 'LIST_PRODUCT_BRAND', name: 'List Brand' },
  { key: 'LIST_PRODUCT', name: 'List Product' },
  { key: 'LIST_UOM', name: 'List UOM' },
  { key: 'LIST_SALE_ORDER', name: 'List Sale Order' },
  { key: 'LIST_SALE_INVOICE', name: 'List Sale Invoice' },
  { key: 'LIST_SALE_RETURN', name: 'List Sales Return' },
  { key: 'LIST_SALE_VOUCHER', name: 'List Sale Voucher' },
  { key: 'LIST_PURCHASE_VOUCHER', name: 'List Purchase Voucher' },
  { key: 'LIST_PURCHASE_RETURN_VOUCHER', name: 'List Purchase Return Voucher' },
  { key: 'LIST_SALE_RETURN_VOUCHER', name: 'List Sale Return Voucher' },
  { key: 'LIST_EXPENSE_VOUCHER', name: 'List Expense Voucher' },
  { key: 'LIST_CONTRA_VOUCHER', name: 'List Contra Voucher' },
  { key: 'LIST_OPENING_STOCK', name: 'List Opening Stock' },
  { key: 'LIST_PURCHASE_STOCK', name: 'List Purchase Stock' },
  { key: 'LIST_TRANSFER_STOCK', name: 'List Transfer Stock' },
  { key: 'LIST_CHART_OF_ACCOUNT', name: 'List Chart of Account' },
  { key: 'LIST_PARTY', name: 'List Party' },
  { key: 'LIST_PURCHASE_QUOTATION', name: 'List Purchase Quotation' },

  { key: 'UPDATE_USER', name: 'Update Users' },
  { key: 'UPDATE_ROLE', name: 'Update Role' },
  { key: 'UPDATE_DESIGNATION', name: 'Update Designation' },
  { key: 'UPDATE_PRODUCT_CATEGORY', name: 'Update Category' },
  { key: 'UPDATE_PRODUCT_SUB_CATEGORY', name: 'Update Sub Category' },
  { key: 'UPDATE_PRODUCT_PRICING', name: 'Update Pricing' },
  { key: 'UPDATE_PRODUCT_BRAND', name: 'Update Brand' },
  { key: 'UPDATE_PRODUCT', name: 'Update Product' },
  { key: 'UPDATE_UOM', name: 'Update UOM' },
  { key: 'UPDATE_SALE_ORDER', name: 'Update Sale Order' },
  { key: 'UPDATE_SALE_INVOICE', name: 'Update Sale Invoice' },
  { key: 'UPDATE_SALE_RETURN', name: 'Update Sale Return' },
  { key: 'UPDATE_SALE_VOUCHER', name: 'Update Sale Voucher' },
  { key: 'UPDATE_PURCHASE_VOUCHER', name: 'Update Purchase Voucher' },
  { key: 'UPDATE_PURCHASE_RETURN_VOUCHER', name: 'Update Purchase Return Voucher' },
  { key: 'UPDATE_SALE_RETURN_VOUCHER', name: 'Update Sale Return Voucher' },
  { key: 'UPDATE_EXPENSE_VOUCHER', name: 'Update Expense Voucher' },
  { key: 'UPDATE_CONTRA_VOUCHER', name: 'Update Contra Voucher' },
  { key: 'APPROVE_SALE_VOUCHER', name: 'Approve Sale Voucher' },
  { key: 'APPROVE_PURCHASE_VOUCHER', name: 'Approve Purchase Voucher' },
  { key: 'APPROVE_PURCHASE_RETURN_VOUCHER', name: 'Approve Purchase Return Voucher' },
  { key: 'APPROVE_SALE_RETURN_VOUCHER', name: 'Approve Sale Return Voucher' },
  { key: 'APPROVE_EXPENSE_VOUCHER', name: 'Approve Expense Voucher' },
  { key: 'APPROVE_CONTRA_VOUCHER', name: 'Approve Contra Voucher' },
  { key: 'UPDATE_OPENING_STOCK', name: 'Update Opening Stock' },
  { key: 'UPDATE_PURCHASE_STOCK', name: 'Update Purchase Stock' },
  { key: 'UPDATE_TRANSFER_STOCK', name: 'Update Transfer Stock' },
  { key: 'UPDATE_CHART_OF_ACCOUNT', name: 'Update Chart of Account' },
  { key: 'UPDATE_PARTY', name: 'Update Party' },
  { key: 'UPDATE_PURCHASE_QUOTATION', name: 'Update Purchase Quotation' },

  { key: 'VIEW_USER', name: 'View Users' },
  { key: 'VIEW_ROLE', name: 'View Role' },
  { key: 'VIEW_DESIGNATION', name: 'View Designation' },
  { key: 'VIEW_PRODUCT_CATEGORY', name: 'View Category' },
  { key: 'VIEW_PRODUCT_SUB_CATEGORY', name: 'View Sub Category' },
  { key: 'VIEW_PRODUCT_BRAND', name: 'View Brand' },
  { key: 'VIEW_PRODUCT', name: 'View Product' },
  { key: 'VIEW_FLAVOUR', name: 'View Flavour' },
  { key: 'VIEW_UOM', name: 'View UOM' },  
  { key: 'VIEW_SALE_ORDER', name: 'View Sale Order' },
  { key: 'VIEW_SALE_INVOICE', name: 'View Sale Invoice' },
  { key: 'VIEW_SALE_RETURN', name: 'View Sale Return' },
  { key: 'VIEW_SALE_VOUCHER', name: 'View Sale Voucher' },
  { key: 'VIEW_PURCHASE_VOUCHER', name: 'View Purchase Voucher' },
  { key: 'VIEW_PURCHASE_RETURN_VOUCHER', name: 'View Purchase Return Voucher' },
  { key: 'VIEW_SALE_RETURN_VOUCHER', name: 'View Sale Return Voucher' },
  { key: 'VIEW_EXPENSE_VOUCHER', name: 'View Expense Voucher' },
  { key: 'VIEW_CONTRA_VOUCHER', name: 'View Contra Voucher' },
  { key: 'VIEW_OPENING_STOCK', name: 'View Opening Stock' },
  { key: 'VIEW_PURCHASE_STOCK', name: 'View Purchase Stock' },
  { key: 'VIEW_TRANSFER_STOCK', name: 'View Transfer Stock' },
  { key: 'VIEW_CHART_OF_ACCOUNT', name: 'View Chart of Account' },
  { key: 'VIEW_PARTY', name: 'View Party' },
  { key: 'VIEW_PURCHASE_QUOTATION', name: 'View Purchase Quotation' },

  { key: 'DELETE_USER', name: 'Delete Users' },
  { key: 'DELETE_ROLE', name: 'Delete Role' },
  { key: 'DELETE_DESIGNATION', name: 'Delete Designation' },
  { key: 'DELETE_PRODUCT_CATEGORY', name: 'Delete Category' },
  { key: 'DELETE_PRODUCT_BRAND', name: 'Delete Brand' },
  { key: 'DELETE_PRODUCT', name: 'Delete Product' },
  { key: 'DELETE_FLAVOUR', name: 'Delete Flavour' },
  { key: 'DELETE_UOM', name: 'Delete UOM' },
  { key: 'DELETE_SALE_ORDER', name: 'Delete Sale Order' },
  { key: 'DELETE_SALE_RETURN', name: 'Delete Sale Return' },
  { key: 'DELETE_OPENING_STOCK', name: 'Delete Opening Stock' },
  { key: 'DELETE_PURCHASE_STOCK', name: 'Delete Purchase Stock' },
  { key: 'DELETE_TRANSFER_STOCK', name: 'Delete Transfer Stock' },
  { key: 'DELETE_CHART_OF_ACCOUNT', name: 'Delete Chart of Account' },
  { key: 'DELETE_PARTY', name: 'Delete Party' },
  { key: 'DELETE_PURCHASE_QUOTATION', name: 'Delete Purchase Quotation' },

];

export async function seedTenantPermissions(dataSource: DataSource) {
  const permissionRepo = dataSource.getRepository(Permission);

  console.log('🌱 Seeding tenant permissions...');

  for (const permissionData of TENANT_PERMISSIONS) {
    const permissionKey = permissionData.key.trim();
    const name = permissionData.name.trim();
    if (!permissionKey || !name) {
      continue;
    }

    const existing = await permissionRepo.findOne({
      where: { key: permissionKey },
    });

    if (!existing) {
      const permission = permissionRepo.create({
        key: permissionKey,
        name,
      });
      await permissionRepo.save(permission);
    } else {
      let shouldUpdate = false;
      if (existing.name !== name) {
        existing.name = name;
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        await permissionRepo.save(existing);
      }
      console.log(`⏭ Permission already exists: ${permissionKey}`);
    }
  }

  console.log('🌱 Tenant permission seeding completed.\n');
}
