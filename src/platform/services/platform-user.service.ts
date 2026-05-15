import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CreatePlatformUserDto } from "../dto/create-platform-user.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { PlatformRole } from "src/master-db/entities/platform-role.entity";
import { PlatformUser } from "src/master-db/entities/platform-user.entity";
import { In, Repository } from "typeorm";
import * as bcrypt from 'bcrypt';
import { PlatformPermission } from "src/master-db/entities/platform-premission.entity";
import { CreateRoleDto } from "../dto/role/create-role.dto";
import { UpdateRoleDto } from "../dto/role/update-role.dto";
import { IsUppercase } from "class-validator";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class PlatformUserService {

    constructor(
        @InjectRepository(PlatformRole)
        private readonly platformRoleRepo: Repository<PlatformRole>,
        @InjectRepository(PlatformUser)
        private readonly platformUserRepo: Repository<PlatformUser>,
        @InjectRepository(PlatformPermission)
        private readonly platformPermissionRepo: Repository<PlatformPermission>,
        private readonly activityLogService: ActivityLogService,
    ) { }

    private async recordAction(action: string, description: string, actorId:string, metadata?: Record<string, any>) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }


    async getPlatformPermissionList(user: any) {
        const permissions = await this.platformPermissionRepo.find({
            select: ['id', 'name', 'code', 'updatedAt'],
            order: { updatedAt: 'DESC' },
        });

        await this.recordAction('PLATFORM_PERMISSION_LIST', 'Platform permission list fetched', user.id, { count: permissions.length });
        return {
            result: permissions
        };
    }

    async createPlatformPermission(perData: { name: string; code: string }[], user: any) {
        // Map through the array of permissions and create each permission
        const permissions = await this.platformPermissionRepo.save(
            perData.map(permission => ({
                name: permission.name,
                code: permission.code.toUpperCase(),
                isActive: true, // Set all permissions as active
            }))
        );

        await this.recordAction('PLATFORM_PERMISSION_CREATE', 'Platform permissions created', user.id, { count: permissions.length });
        return {
            result: permissions, // Return the created permissions
        };
    }


    async getPlatformRoleList(user: any) {
        // 1️⃣ Fetch tenants
        const roles = await this.platformRoleRepo.find({
            select: ['id', 'name', 'code', 'updatedAt'],
            order: { updatedAt: 'DESC' },
        });

        await this.recordAction('PLATFORM_ROLE_LIST', 'Platform role list fetched', user.id, { count: roles.length });
        return {
            result: roles
        };
    }

    async getPlatformRole(id: string, user: any) {
        const role = await this.platformRoleRepo.findOne({
            where: { id: id },
            relations: ['permissions'],
        });
        await this.recordAction('PLATFORM_ROLE_SHOW', 'Platform role details fetched', user.id, { roleId: id });
        return role;
    }

    async createPlatformRole(roleData: CreateRoleDto, user: any) {
        const existing = await this.platformRoleRepo.findOne({
            where: { code: roleData.code },
        });

        if (existing) {
            throw new ConflictException('Role with this code already exists');
        }

        const permissions = await this.platformPermissionRepo.find({
            where: {
                code: In(roleData.permissions),
            },
        });

        if (permissions.length !== roleData.permissions.length) {
            throw new NotFoundException('One or more permissions not found');
        }

        const role = await this.platformRoleRepo.save(
            this.platformRoleRepo.create({
                name: roleData.name,
                code: roleData.code,
                isActive: roleData.is_active ?? true,
                permissions: permissions,
            })
        );

        await this.recordAction('PLATFORM_ROLE_CREATE', 'Platform role created', user.id, { roleId: role.id, code: role.code });
        return role;
    }

    async updatePlatformRole(roleId: any, roleData: UpdateRoleDto, user: any) {
        const role = await this.platformRoleRepo.findOne({
            where: { id: roleId },
            relations: ['permissions'],
        });

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        const permissions = await this.platformPermissionRepo.find({
            where: {
                code: In(roleData.permissions),
            },
        }); 

        if (permissions.length !== roleData.permissions.length) {
            throw new NotFoundException('One or more permissions not found');
        }

        role.name = roleData.name;
        role.code = roleData.code;
        role.isActive = roleData.is_active ?? true;
        role.permissions = permissions;

        await this.platformRoleRepo.save(role);
        await this.recordAction('PLATFORM_ROLE_UPDATE', 'Platform role updated', user.id, { roleId });
        return role;
    }


    // USER

    async getPlatformUserList(user: any) {
        // 1️⃣ Fetch tenants
        const users = await this.platformUserRepo.find({
            select: ['id', 'fullName', 'email', 'role', 'updatedAt'],
            order: { updatedAt: 'DESC' },
        });

        await this.recordAction('PLATFORM_USER_LIST', 'Platform user list fetched', user.id, { count: users.length });
        return {
            result: users
        };
    }

    async createPlatformUser(dto: CreatePlatformUserDto, user: any) {

        let password = String(dto.passwordHash);

        const existing = await this.platformUserRepo.findOne({
            where: { email: dto.email },
        });

        if (existing) {
            throw new ConflictException('User with this email already exists');
        }

        const platformUser = await this.platformUserRepo.save(
            this.platformUserRepo.create({
                fullName: dto.fullname,
                email: dto.email,
                passwordHash: await bcrypt.hash(password, 10),
                role: dto.role
            })
        );
        await this.recordAction('PLATFORM_USER_CREATE', 'Platform user created', user.id, { userId: platformUser.id, email: platformUser.email });

        return {
            message: 'User is created successfully'
        }
    }

    async getPlatformUser(id: string, Authuser: any) {
        const user = await this.platformUserRepo.findOne({
            where: { id: id },
            relations: ['role'],
        });
        await this.recordAction('PLATFORM_USER_SHOW', 'Platform user details fetched', Authuser.id, { userId: id });
        return user;
    }

    async changePlatformUserPassword(password: string, user: any) {
        const platformUser = await this.platformUserRepo.findOne({
            where: { id: user.id },
        });
        if (!platformUser) {
            throw new NotFoundException('User not found');
        }
        platformUser.passwordHash = await bcrypt.hash(password, 10);
        await this.platformUserRepo.save(platformUser);
        await this.recordAction('PLATFORM_USER_PASSWORD_CHANGE', 'Platform user password changed', user.id, { userId: platformUser.id });
        return {
            message: 'password changed successfully',
            user: platformUser
        }
    }
}