import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import {
  DeleteUserRequest,
  DeleteUserRequestStatus,
} from 'src/tenant-db/entities/delete-user-request.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { UserBusiness } from 'src/tenant-db/entities/user-business.entity';
import { ActivityLogService } from './activity-log.service';
import { RequestAccountDeletionDto } from '../dto/user/request-account-deletion.dto';

@Injectable()
export class DeleteUserRequestService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async requestDeletion(
    tenantDb: DataSource,
    authUser: TenantRequestUser,
    dto: RequestAccountDeletionDto,
  ) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: authUser.userId, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const requestRepo = tenantDb.getRepository(DeleteUserRequest);
    const existingPending = await requestRepo.findOne({
      where: {
        userId: user.id,
        status: DeleteUserRequestStatus.PENDING,
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'A pending account deletion request already exists',
      );
    }

    const memberships = await tenantDb.getRepository(UserBusiness).find({
      where: { userId: user.id, deletedAt: IsNull() },
      relations: { business: true },
    });

    const businesses = memberships
      .filter((membership) => membership.business)
      .map((membership) => ({
        id: membership.business.id,
        code: membership.business.code,
        name: membership.business.name,
      }));

    const request = await requestRepo.save(
      requestRepo.create({
        userId: user.id,
        reason: dto.reason.trim(),
        businesses,
        status: DeleteUserRequestStatus.PENDING,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId ?? null,
      action: 'ACCOUNT_DELETION_REQUESTED',
      description: `Account deletion requested by ${user.email}`,
      metadata: {
        requestId: request.id,
        userId: user.id,
        businessIds: businesses.map((business) => business.id),
      },
    });

    return {
      message: 'Account deletion request submitted successfully',
      request,
    };
  }

  async listRequests(
    tenantDb: DataSource,
    options: {
      page?: number;
      limit?: number;
      status?: DeleteUserRequestStatus;
    },
    authUser: { userId: string; businessId?: string },
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(DeleteUserRequest)
      .createQueryBuilder('request')
      .withDeleted()
      .leftJoinAndSelect('request.user', 'user')
      .orderBy('request.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (options.status) {
      qb.andWhere('request.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId ?? null,
      action: 'DELETE_USER_REQUESTS_LISTED',
      description: 'Delete user requests listed',
      metadata: { total, page, limit, status: options.status ?? null },
    });

    return {
      data,
      meta: { total, page, limit },
    };
  }

  /**
   * Soft-deletes the user account (`users.deletedAt`) and marks related
   * pending deletion requests as COMPLETED.
   */
  async deleteAccount(
    tenantDb: DataSource,
    userId: string,
    authUser: { userId: string; businessId?: string },
  ) {
    if (authUser.userId === userId) {
      throw new BadRequestException('You cannot delete your own account here');
    }

    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isSuperAdmin) {
      const otherSuperAdmins = await userRepo.count({
        where: { isSuperAdmin: true, deletedAt: IsNull() },
      });
      if (otherSuperAdmins <= 1) {
        throw new BadRequestException(
          'Cannot delete the last super admin account',
        );
      }
    }

    await userRepo.softRemove(user);

    await tenantDb.getRepository(DeleteUserRequest).update(
      {
        userId,
        status: DeleteUserRequestStatus.PENDING,
      },
      { status: DeleteUserRequestStatus.COMPLETED },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId ?? null,
      action: 'USER_ACCOUNT_DELETED',
      description: `User account ${user.email} soft-deleted`,
      metadata: { userId: user.id, email: user.email },
    });

    return {
      message: 'User account deleted successfully',
      userId: user.id,
    };
  }
}
