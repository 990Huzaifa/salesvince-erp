import * as bcrypt from 'bcrypt';
import { DataSource, IsNull } from 'typeorm';
import { User, UserStatus } from '../entities/user.entity';

export const TENANT_SUPER_ADMIN_USER = {
  code: 'ERP-SYSTEM-ADMIN',
  name: 'System Admin',
  email: 'tenant.admin@erp.com',
  /** Override with TENANT_SUPER_ADMIN_PASSWORD in environment for provisioning. */
  password: 'demo9090',
};

export async function seedTenantSuperAdminUser(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);

  console.log('🌱 Seeding tenant super admin user...');

  const email = TENANT_SUPER_ADMIN_USER.email.trim().toLowerCase();
  const passwordPlain =
    process.env.TENANT_SUPER_ADMIN_PASSWORD ?? TENANT_SUPER_ADMIN_USER.password;

  let user = await userRepo.findOne({
    where: { email, deletedAt: IsNull() },
  });

  if (!user) {
    user = userRepo.create({
      code: TENANT_SUPER_ADMIN_USER.code,
      name: TENANT_SUPER_ADMIN_USER.name,
      email,
      password: await bcrypt.hash(passwordPlain, 10),
      status: UserStatus.ACTIVE,
      isSuperAdmin: true,
    });
    user = await userRepo.save(user);
    console.log(`✅ Tenant super admin user created: ${email}`);
  } else {
    let shouldUpdate = false;
    if (!user.isSuperAdmin) {
      user.isSuperAdmin = true;
      shouldUpdate = true;
    }
    if (user.status !== UserStatus.ACTIVE) {
      user.status = UserStatus.ACTIVE;
      shouldUpdate = true;
    }
    if (user.deletedAt != null) {
      user.deletedAt = null;
      shouldUpdate = true;
    }
    if (shouldUpdate) {
      await userRepo.save(user);
    }
    console.log(`⏭ Tenant super admin already exists: ${email}`);
  }

  console.log('🌱 Tenant super admin user seeding completed.\n');
}
