import { DataSource } from 'typeorm';
import { ensureSuperAdminRole } from '../helpers/tenant-business-bootstrap.helper';

export async function seedTenantSuperAdminRole(dataSource: DataSource): Promise<void> {
  console.log('🌱 Seeding tenant super admin role...');
  const role = await ensureSuperAdminRole(dataSource);
  console.log(`✅ Tenant super admin role ready: ${role.name} (${role.id})`);
  console.log('🌱 Tenant super admin role seeding completed.\n');
}
