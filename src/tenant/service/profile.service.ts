import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';
import { ChangePasswordDto } from '../dto/profile/change-password.dto';

type AuthUser = { userId: string; businessId?: string };

@Injectable()
export class ProfileService {
    constructor(private readonly activityLogService: ActivityLogService) { }

    private stripPassword(user: User): User {
        delete (user as { password?: string }).password;
        return user;
    }

    async getProfile(tenantDb: DataSource, authUser: AuthUser) {
        const userRepo = tenantDb.getRepository(User);
        const user = await userRepo.findOne({
            where: { id: authUser.userId, deletedAt: IsNull() },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: authUser.userId,
            businessId: authUser.businessId ?? null,
            action: 'PROFILE_VIEWED',
            description: 'Profile viewed',
            metadata: { userId: user.id },
        });

        return this.stripPassword(user);
    }

    async updateProfile(
        tenantDb: DataSource,
        authUser: AuthUser,
        dto: UpdateProfileDto,
    ) {
        const userRepo = tenantDb.getRepository(User);
        const user = await userRepo.findOne({
            where: { id: authUser.userId, deletedAt: IsNull() },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (dto.email !== undefined) {
            const email = dto.email.trim().toLowerCase();
            if (email !== user.email) {
                const existing = await userRepo.findOne({
                    where: { email, deletedAt: IsNull() },
                    select: ['id'],
                });
                if (existing && existing.id !== user.id) {
                    throw new ConflictException('Email is already in use');
                }
                user.email = email;
            }
        }

        if (dto.name !== undefined) user.name = dto.name.trim();
        if (dto.phone !== undefined) user.phone = dto.phone?.trim() ?? null;
        if (dto.cnic !== undefined) user.cnic = dto.cnic?.trim() ?? null;
        if (dto.address !== undefined) user.address = dto.address?.trim() ?? null;
        if (dto.avatar !== undefined) user.avatar = dto.avatar?.trim() ?? null;
        if (dto.deviceId !== undefined) user.deviceId = dto.deviceId?.trim() ?? null;
        if (dto.fcmToken !== undefined) user.fcmToken = dto.fcmToken?.trim() ?? null;
        if (dto.appVersion !== undefined) user.appVersion = dto.appVersion?.trim() ?? null;

        const saved = await userRepo.save(user);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: authUser.userId,
            businessId: authUser.businessId ?? null,
            action: 'PROFILE_UPDATED',
            description: 'Profile updated',
            metadata: { userId: saved.id },
        });

        return {
            message: 'Profile updated successfully',
            profile: this.stripPassword(saved),
        };
    }

    async changePassword(
        tenantDb: DataSource,
        authUser: AuthUser,
        dto: ChangePasswordDto,
    ) {
        if (dto.currentPassword === dto.newPassword) {
            throw new BadRequestException('New password must be different from current password');
        }

        const userRepo = tenantDb.getRepository(User);
        const user = await userRepo.findOne({
            where: { id: authUser.userId, deletedAt: IsNull() },
        });

        if (!user?.password) {
            throw new BadRequestException('Password is not set for this account');
        }

        const valid = await bcrypt.compare(dto.currentPassword, user.password);
        if (!valid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        user.password = await bcrypt.hash(dto.newPassword, 10);
        await userRepo.save(user);

        await this.activityLogService.recordActivityLog(tenantDb, {
            actorId: authUser.userId,
            businessId: authUser.businessId ?? null,
            action: 'PROFILE_PASSWORD_CHANGED',
            description: 'Password changed',
            metadata: { userId: user.id },
        });

        return { message: 'Password changed successfully' };
    }
}
