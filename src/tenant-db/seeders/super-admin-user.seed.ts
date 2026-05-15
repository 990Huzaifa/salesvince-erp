import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Role } from '../entities/role.entity';
import { Designation, User } from '../entities/user.entity';

export const TENANT_SUPER_ADMIN_USER = {
  code: 'SND-TENANT-ADMIN',
  name: 'Tenant Super Admin',
  email: 'tenant.admin@snd.com',
  password: 'demo9090',
};

export async function seedTenantSuperAdminUser(dataSource: DataSource) {
  const userRepo = dataSource.getRepository(User);
  const roleRepo = dataSource.getRepository(Role);
  const designationRepo = dataSource.getRepository(Designation);

  console.log('🌱 Seeding tenant super admin user...');

  const superAdminRole = await roleRepo.findOne({
    where: { name: 'Super Admin' },
  });

  if (!superAdminRole) {
    throw new Error('Super Admin role not found. Run role seeder first.');
  }
  const superAdminDesignation = await designationRepo.findOne({
    where: { slug: 'ceo' },
  });
  if (!superAdminDesignation) {
    throw new Error(
      'Super Admin designation not found. Run designation seeder first.',
    );
  }

  const email = TENANT_SUPER_ADMIN_USER.email.trim().toLowerCase();
  const existing = await userRepo.findOne({
    where: { email },
    relations: ['role'],
  });

  if (!existing) {
    const user = userRepo.create({
      code: TENANT_SUPER_ADMIN_USER.code,
      name: TENANT_SUPER_ADMIN_USER.name,
      email,
      password: await bcrypt.hash(TENANT_SUPER_ADMIN_USER.password, 10),
      role: superAdminRole,
      designation: superAdminDesignation,
      isActive: true,
      isDeleted: false,
    });

    await userRepo.save(user);
    console.log(`✅ Tenant super admin user created: ${email}`);
  } else {
    let shouldUpdate = false;

    if (existing.roleId !== superAdminRole.id) {
      existing.role = superAdminRole;
      shouldUpdate = true;
    }
    if (existing.designationId !== superAdminDesignation.id) {
      existing.designation = superAdminDesignation;
      shouldUpdate = true;
    }
    if (!existing.isActive) {
      existing.isActive = true;
      shouldUpdate = true;
    }
    if (existing.isDeleted) {
      existing.isDeleted = false;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      await userRepo.save(existing);
    }
    console.log(`⏭ Tenant super admin already exists: ${email}`);
  }

  console.log('🌱 Tenant super admin user seeding completed.\n');
}
