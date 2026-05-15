import dataSource from '../../../typeorm.master.config';
import { seedPlatformRoles } from './platform-role.seed';
import { seedPlatformPermissions } from './platform-permission.seed';
import { seedRolePermissions } from './platform-role-has-permission.seed';
import { seedPlatformAdminUser } from './platform-admin.seed';
import { geoDataSeeder } from './geo-data.seed';

async function runPlatformSeeders() {
    try {
        await dataSource.initialize();

        console.log('\n🚀 Running Platform Seeders...\n');

        // await seedPlatformRoles(dataSource);
        // await seedPlatformPermissions(dataSource);
        // await seedRolePermissions(dataSource);
        // await seedPlatformAdminUser(dataSource);

        // await geoDataSeeder(dataSource);

        console.log('🎉 All platform seeders completed successfully.');
    } catch (error) {
        console.error('❌ Seeder execution failed:', error);
    } finally {
        await dataSource.destroy();
    }
}

runPlatformSeeders();
