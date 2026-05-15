import { DataSource } from 'typeorm';
import { seedTenantPermissions } from './permission.seed';
import { seedTenantRoles } from './role.seed';
import { seedTenantDesignations } from './designation.seed';
import { seedTenantSuperAdminUser } from './super-admin-user.seed';
import { seedTenantUoms } from './uom.seed';

export async function runTenantSeeders(dataSource: DataSource) {
  console.log('\n🚀 Running Tenant Seeders...\n');

  // Required order:
  // 1) permissions
  // 2) roles (assign permission to role)
  // 3) designations
  // 4) uoms
  // 5) users (assign role/designation to user)
  await seedTenantPermissions(dataSource);
  await seedTenantRoles(dataSource);
  await seedTenantDesignations(dataSource);
  await seedTenantUoms(dataSource);
  await seedTenantSuperAdminUser(dataSource);

  console.log('🎉 Tenant seeders completed successfully.\n');
}
