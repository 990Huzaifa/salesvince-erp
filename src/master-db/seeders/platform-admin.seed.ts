import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { PlatformUser } from '../entities/platform-user.entity';
import { PlatformRole } from '../entities/platform-role.entity';

export async function seedPlatformAdminUser(dataSource: DataSource) {
    const roleRepo = dataSource.getRepository(PlatformRole);
    const userRepo = dataSource.getRepository(PlatformUser);

    console.log('🌱 Seeding platform admin user...');

    const email = 'admin@erp.com';

    let user = await userRepo.findOne({
        where: { email },
        relations: ['role'], // load role to check if it's already assigned
    });

    const superAdminRole = await roleRepo.findOne({
        where: { code: 'SUPER_ADMIN' },
    });

    if (!superAdminRole) {
        throw new Error('SUPER_ADMIN role not found. Run role seed first.');
    }

    if (!user) {
        user = userRepo.create({
            email,
            fullName: 'ERP Super Admin',
            passwordHash: await bcrypt.hash('demo9090', 10),
            role: superAdminRole,
        });
        await userRepo.save(user);

        await userRepo.save(user);
        console.log('✅ Platform admin user created');
    } else {
        user.role = superAdminRole;
        await userRepo.save(user);
        console.log('⏭ Platform admin already exists, role ensured');
    }

    console.log('🌱 Platform admin seeding completed.\n');
}
