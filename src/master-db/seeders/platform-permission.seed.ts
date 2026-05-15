import { DataSource } from 'typeorm';
import { PlatformPermission } from '../entities/platform-premission.entity';

export const PLATFORM_PERMISSIONS = [
    { code: "ANNOUNCEMENT_LIST", name: "View Announcement" },
    { code: "ANNOUNCEMENT_CREATE", name: "Create Announcement" },
    { code: "ANNOUNCEMENT_UPDATE", name: "Update Announcement" },
    { code: "ANNOUNCEMENT_VIEW", name: "View Announcement" },
    { code: "PLAN_LIST", name: "View Plan" },
    { code: "PLAN_CREATE", name: "Create Plan" },
    { code: "PLAN_UPDATE", name: "Update Plan" },
    { code: "PLAN_VIEW", name: "View Plan" },
    { code: "BILLING_VIEW", name: "View Billing" },
    { code: "MODULE_MANAGE", name: "Manage Modules" },
    { code: "TENANT_VIEW", name: "View Tenant" },
    { code: "TENANT_CREATE", name: "Create Tenant" },
    { code: "TENANT_SUSPEND", name: "Suspend Tenant" },
    { code: "TENANT_UPDATE", name: "Update Tenant" },
    { code: "USER_CREATE", name: "Create User" },
    { code: "USER_VIEW", name: "View User" },
    { code: "USER_LIST", name: "List Users" },
    { code: "USER_UPDATE", name: "Update User" },
    { code: "ROLE_LIST", name: "List Roles" },
    { code: "ROLE_VIEW", name: "View Role" },
    { code: "ROLE_CREATE", name: "Create Role" },
    { code: "ROLE_UPDATE", name: "Update Role" },
];

export async function seedPlatformPermissions(dataSource: DataSource) {
    const repo = dataSource.getRepository(PlatformPermission);

    console.log('🌱 Seeding platform permissions...');

    for (const perm of PLATFORM_PERMISSIONS) {
        const existing = await repo.findOne({
            where: { code: perm.code },
        });

        if (!existing) {
            await repo.save(repo.create(perm));
            console.log(`✅ Permission created: ${perm.code}`);
        } else {
            console.log(`⏭ Permission already exists: ${perm.code}`);
        }
    }

    console.log('🌱 Platform permission seeding completed.\n');
}
