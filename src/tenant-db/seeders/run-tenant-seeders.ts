import { DataSource } from 'typeorm';
import { seedTenantPermissions } from './permission.seed';
import { seedTenantSuperAdminRole } from './super-admin-role.seed';
import { seedTenantSuperAdminUser } from './super-admin-user.seed';

/**
 * Provisioning order for tenant DB (matches entity dependencies):
 * 1) Global permission catalog
 * 2) Super admin role (permissions synced via role_permissions)
 * 3) Super admin user
 */
export async function runTenantSeeders(dataSource: DataSource) {
  console.log('\n🚀 Running Tenant Seeders...\n');

  await seedTenantPermissions(dataSource);
  await seedTenantSuperAdminRole(dataSource);
  await seedTenantSuperAdminUser(dataSource);

  console.log('🎉 Tenant seeders completed successfully.\n');
}
