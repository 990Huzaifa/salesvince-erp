import { DataSource, In } from 'typeorm';
import { PlatformRole } from '../entities/platform-role.entity';
import { PlatformPermission } from '../entities/platform-premission.entity';

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
    SUPER_ADMIN: [
        "ANNOUNCEMENT_LIST",
        "ANNOUNCEMENT_CREATE",
        "ANNOUNCEMENT_UPDATE",
        "ANNOUNCEMENT_VIEW",
        "PLAN_LIST",
        "PLAN_CREATE",
        "PLAN_UPDATE",
        "PLAN_VIEW",
        "BILLING_VIEW",
        "MODULE_MANAGE",
        "TENANT_VIEW",
        "TENANT_CREATE",
        "TENANT_SUSPEND",
        "TENANT_UPDATE",
        "USER_CREATE",
        "USER_VIEW",
        "USER_LIST",
        "USER_UPDATE",
        "ROLE_LIST",
        "ROLE_VIEW",
        "ROLE_CREATE",
        "ROLE_UPDATE"
    ],
    SUPPORT: ['TENANT_VIEW', 'TENANT_UPDATE'],
    FINANCE: ['BILLING_VIEW'],
};

export async function seedRolePermissions(dataSource: DataSource) {
    const roleRepo = dataSource.getRepository(PlatformRole);
    const permRepo = dataSource.getRepository(PlatformPermission);

    console.log('🌱 Seeding role-permission mappings...');

    for (const roleCode in ROLE_PERMISSION_MAP) {
        const role = await roleRepo.findOne({
            where: { code: roleCode },
            relations: ['permissions'],
        });

        if (!role) {
            console.log(`⚠ Role not found: ${roleCode}`);
            continue;
        }

        const permissions = await permRepo.find({
            where: { code: In(ROLE_PERMISSION_MAP[roleCode]) },
        });

        role.permissions = permissions;
        await roleRepo.save(role);

        console.log(`✅ Permissions assigned to: ${roleCode}`);
    }

    console.log('🌱 Role-permission seeding completed.\n');
}
