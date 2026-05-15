import { DataSource } from 'typeorm';
import { PlatformRole } from '../entities/platform-role.entity';

export const PLATFORM_ROLES = [
    {
        code: 'SUPER_ADMIN',
        name: 'Super Admin',
        description: 'Full system access',
    },
    {
        code: 'SUPPORT',
        name: 'Support',
        description: 'Customer support access',
    },
    {
        code: 'FINANCE',
        name: 'Finance',
        description: 'Billing and subscription access',
    },
];

export async function seedPlatformRoles(dataSource: DataSource) {
    const roleRepo = dataSource.getRepository(PlatformRole);

    console.log('🌱 Seeding platform roles...');

    for (const roleData of PLATFORM_ROLES) {
        const existing = await roleRepo.findOne({
            where: { code: roleData.code },
        });

        if (!existing) {
            const role = roleRepo.create(roleData);
            await roleRepo.save(role);
            console.log(`✅ Role created: ${roleData.code}`);
        } else {
            console.log(`⏭ Role already exists: ${roleData.code}`);
        }
    }

    console.log('🌱 Platform role seeding completed.\n');
}
