import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ActivityLog } from 'src/tenant-db/entities/activity-log.entity';
import { Business, BusinessStatus } from 'src/tenant-db/entities/business.entity';
import {
  DatabaseBackup,
  DatabaseBackupStatus,
} from 'src/tenant-db/entities/database-backup.entity';
import {
  DeleteUserRequest,
  DeleteUserRequestStatus,
} from 'src/tenant-db/entities/delete-user-request.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { User, UserStatus } from 'src/tenant-db/entities/user.entity';
import { UserBusiness } from 'src/tenant-db/entities/user-business.entity';
import { ActivityLogService } from './activity-log.service';
import { AdminDashboardQueryDto } from '../dto/dashboard/admin-dashboard.query.dto';

type ActivityTone = 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

type DashboardActivityType =
  | 'USER_INVITED'
  | 'USER_APPROVED'
  | 'DELETE_REQUEST_CREATED'
  | 'DELETE_REQUEST_APPROVED'
  | 'DELETE_REQUEST_REJECTED'
  | 'BACKUP_COMPLETED'
  | 'BACKUP_FAILED'
  | 'ROLE_UPDATED'
  | 'BUSINESS_INACTIVE'
  | 'OTHER';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getDashboard(
    tenantDb: DataSource,
    authUser: TenantRequestUser,
    query: AdminDashboardQueryDto,
  ) {
    const months = Math.min(12, Math.max(3, Number(query.months) || 7));
    const pendingLimit = Math.min(
      50,
      Math.max(1, Number(query.pendingLimit) || 5),
    );
    const businessLimit = Math.min(
      50,
      Math.max(1, Number(query.businessLimit) || 5),
    );
    const activityLimit = Math.min(
      50,
      Math.max(1, Number(query.activityLimit) || 10),
    );

    const [
      userCounts,
      businessCounts,
      rolesCount,
      pendingReviewsCount,
      deleteRequestCounts,
      backupStats,
      growth,
      roleDistribution,
      pendingReviews,
      deleteRequests,
      recentBusinesses,
      activity,
    ] = await Promise.all([
      this.getUserCounts(tenantDb),
      this.getBusinessCounts(tenantDb),
      this.getRolesCount(tenantDb),
      this.getPendingReviewsCount(tenantDb),
      this.getDeleteRequestCounts(tenantDb),
      this.getBackupStats(tenantDb),
      this.getGrowthSeries(tenantDb, months),
      this.getRoleDistribution(tenantDb),
      this.getPendingReviews(tenantDb, pendingLimit),
      this.getPendingDeleteRequests(tenantDb, pendingLimit),
      this.getRecentBusinesses(tenantDb, businessLimit),
      this.getActivity(tenantDb, activityLimit),
    ]);

    const totalUsers =
      userCounts.active + userCounts.inactive + userCounts.deleted;
    const attentionCount =
      pendingReviewsCount + deleteRequestCounts.pending;
    const avgUsersPerBusiness =
      businessCounts.total > 0
        ? Math.round((totalUsers / businessCounts.total) * 10) / 10
        : 0;

    const health = this.buildHealth({
      attentionCount,
      avgUsersPerBusiness,
      backupsThisWeek: backupStats.backupsThisWeek,
      lastBackupAt: backupStats.lastBackupAt,
      totalBusinesses: businessCounts.total,
    });

    const payload = {
      kpis: {
        totalUsers,
        activeUsers: userCounts.active,
        inactiveUsers: userCounts.inactive,
        deletedUsers: userCounts.deleted,
        totalBusinesses: businessCounts.total,
        activeBusinesses: businessCounts.active,
        roles: rolesCount,
        pendingReviews: pendingReviewsCount,
        pendingDeleteRequests: deleteRequestCounts.pending,
        completedDeletes: deleteRequestCounts.completed,
        backupsThisWeek: backupStats.backupsThisWeek,
        lastBackupAt: backupStats.lastBackupAt,
      },
      health,
      charts: {
        growth,
        userStatus: {
          active: userCounts.active,
          inactive: userCounts.inactive,
          deleted: userCounts.deleted,
        },
        roleDistribution,
      },
      pendingReviews,
      deleteRequests,
      recentBusinesses,
      activity,
    };

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId ?? null,
      action: 'ADMIN_DASHBOARD_VIEWED',
      description: 'Admin dashboard viewed',
      metadata: {
        months,
        pendingLimit,
        businessLimit,
        activityLimit,
      },
    });

    return payload;
  }

  private async getUserCounts(tenantDb: DataSource) {
    const userRepo = tenantDb.getRepository(User);

    const [active, inactive, deleted] = await Promise.all([
      userRepo.count({
        where: { status: UserStatus.ACTIVE, deletedAt: IsNull() },
      }),
      userRepo.count({
        where: { status: UserStatus.INACTIVE, deletedAt: IsNull() },
      }),
      userRepo
        .createQueryBuilder('u')
        .withDeleted()
        .where('u.deletedAt IS NOT NULL')
        .getCount(),
    ]);

    return { active, inactive, deleted };
  }

  private async getBusinessCounts(tenantDb: DataSource) {
    const businessRepo = tenantDb.getRepository(Business);
    const [total, active] = await Promise.all([
      businessRepo.count({ where: { deletedAt: IsNull() } }),
      businessRepo.count({
        where: { status: BusinessStatus.ACTIVE, deletedAt: IsNull() },
      }),
    ]);
    return { total, active };
  }

  private async getRolesCount(tenantDb: DataSource) {
    return tenantDb.getRepository(Role).count({
      where: { deletedAt: IsNull() },
    });
  }

  /** Invited users who have not completed setup (no password yet). */
  private async getPendingReviewsCount(tenantDb: DataSource) {
    return tenantDb.getRepository(User).count({
      where: { password: IsNull(), deletedAt: IsNull() },
    });
  }

  private async getDeleteRequestCounts(tenantDb: DataSource) {
    const repo = tenantDb.getRepository(DeleteUserRequest);
    const [pending, completed] = await Promise.all([
      repo.count({ where: { status: DeleteUserRequestStatus.PENDING } }),
      repo.count({ where: { status: DeleteUserRequestStatus.COMPLETED } }),
    ]);
    return { pending, completed };
  }

  private async getBackupStats(tenantDb: DataSource) {
    const repo = tenantDb.getRepository(DatabaseBackup);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [backupsThisWeek, latest] = await Promise.all([
      repo
        .createQueryBuilder('b')
        .where('b.status = :status', {
          status: DatabaseBackupStatus.COMPLETED,
        })
        .andWhere('b.createdAt >= :weekAgo', { weekAgo })
        .getCount(),
      repo.findOne({
        where: { status: DatabaseBackupStatus.COMPLETED },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      backupsThisWeek,
      lastBackupAt: latest?.createdAt?.toISOString() ?? null,
    };
  }

  /** Cumulative totals as of end of each month (last N months including current). */
  private async getGrowthSeries(tenantDb: DataSource, months: number) {
    const now = new Date();
    const labels: string[] = [];
    const users: number[] = [];
    const businesses: number[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endOfMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      labels.push(MONTH_LABELS[monthDate.getMonth()]);

      const [userCount, businessCount] = await Promise.all([
        tenantDb
          .getRepository(User)
          .createQueryBuilder('u')
          .withDeleted()
          .where('u.createdAt <= :endOfMonth', { endOfMonth })
          .getCount(),
        tenantDb
          .getRepository(Business)
          .createQueryBuilder('b')
          .where('b.deletedAt IS NULL')
          .andWhere('b.createdAt <= :endOfMonth', { endOfMonth })
          .getCount(),
      ]);

      users.push(userCount);
      businesses.push(businessCount);
    }

    return { labels, users, businesses };
  }

  private async getRoleDistribution(tenantDb: DataSource) {
    const rows = await tenantDb
      .getRepository(UserBusiness)
      .createQueryBuilder('ub')
      .innerJoin('ub.role', 'role')
      .innerJoin('ub.user', 'user')
      .select('role.id', 'roleId')
      .addSelect('role.name', 'name')
      .addSelect('COUNT(DISTINCT ub.userId)', 'count')
      .where('ub.deletedAt IS NULL')
      .andWhere('user.deletedAt IS NULL')
      .andWhere('role.deletedAt IS NULL')
      .groupBy('role.id')
      .addGroupBy('role.name')
      .orderBy('COUNT(DISTINCT ub.userId)', 'DESC')
      .limit(8)
      .getRawMany<{ roleId: string; name: string; count: string }>();

    const distribution: Array<{
      roleId: string | null;
      name: string;
      count: number;
    }> = rows.map((row) => ({
      roleId: row.roleId,
      name: row.name,
      count: Number(row.count ?? 0),
    }));

    const unassigned = await tenantDb
      .getRepository(User)
      .createQueryBuilder('u')
      .leftJoin(
        UserBusiness,
        'ub',
        'ub.userId = u.id AND ub.deletedAt IS NULL',
      )
      .where('u.deletedAt IS NULL')
      .andWhere('ub.id IS NULL')
      .getCount();

    if (unassigned > 0) {
      distribution.push({
        roleId: null,
        name: 'Unassigned',
        count: unassigned,
      });
    }

    return distribution;
  }

  private async getPendingReviews(tenantDb: DataSource, limit: number) {
    const users = await tenantDb.getRepository(User).find({
      where: { password: IsNull(), deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['id', 'name', 'email', 'createdAt'],
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      requestedAt: user.createdAt.toISOString(),
    }));
  }

  private async getPendingDeleteRequests(tenantDb: DataSource, limit: number) {
    const requests = await tenantDb.getRepository(DeleteUserRequest).find({
      where: { status: DeleteUserRequestStatus.PENDING },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return requests.map((request) => ({
      id: request.id,
      userId: request.userId,
      name: request.user?.name ?? '',
      email: request.user?.email ?? '',
      reason: request.reason,
      businesses: request.businesses ?? [],
      status: request.status,
      requestedAt: request.createdAt.toISOString(),
    }));
  }

  private async getRecentBusinesses(tenantDb: DataSource, limit: number) {
    const businesses = await tenantDb.getRepository(Business).find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const result = await Promise.all(
      businesses.map(async (business) => {
        const usersCount = await tenantDb.getRepository(UserBusiness).count({
          where: { businessId: business.id, deletedAt: IsNull() },
        });
        return {
          id: business.id,
          name: business.name,
          code: business.code,
          usersCount,
          status: business.status,
          createdAt: business.createdAt.toISOString(),
        };
      }),
    );

    return result;
  }

  private async getActivity(tenantDb: DataSource, limit: number) {
    const logs = await tenantDb.getRepository(ActivityLog).find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: { actor: true },
    });

    return logs.map((log) => {
      const mapped = this.mapActivity(log);
      return {
        id: log.id,
        type: mapped.type,
        text: mapped.text,
        meta: mapped.meta,
        tone: mapped.tone,
        createdAt: log.createdAt.toISOString(),
      };
    });
  }

  private mapActivity(log: ActivityLog): {
    type: DashboardActivityType;
    text: string;
    meta: string;
    tone: ActivityTone;
  } {
    const actorName = log.actor?.name ?? log.actor?.email ?? '';
    const metaFromDescription =
      log.description?.replace(/^[^:]+:\s*/, '') ?? actorName;

    switch (log.action) {
      case 'USER_INVITED':
      case 'USER_INVITE_RESENT':
        return {
          type: 'USER_INVITED',
          text: 'New system user invited',
          meta: actorName || metaFromDescription,
          tone: 'primary',
        };
      case 'ACCOUNT_DELETION_REQUESTED':
        return {
          type: 'DELETE_REQUEST_CREATED',
          text: 'Delete request submitted',
          meta: metaFromDescription || actorName,
          tone: 'warning',
        };
      case 'USER_ACCOUNT_DELETED':
        return {
          type: 'DELETE_REQUEST_APPROVED',
          text: 'User account deleted',
          meta: metaFromDescription || actorName,
          tone: 'destructive',
        };
      case 'DELETE_USER_REQUEST_REMOVED':
        return {
          type: 'DELETE_REQUEST_REJECTED',
          text: 'Delete request rejected',
          meta: metaFromDescription || actorName,
          tone: 'muted',
        };
      case 'ROLE_UPDATED':
      case 'ROLE_PERMISSIONS_UPDATED':
        return {
          type: 'ROLE_UPDATED',
          text: 'Role permissions updated',
          meta: metaFromDescription || actorName,
          tone: 'primary',
        };
      default:
        if (log.action.includes('BACKUP') && log.action.includes('FAIL')) {
          return {
            type: 'BACKUP_FAILED',
            text: 'Backup failed',
            meta: metaFromDescription || actorName,
            tone: 'destructive',
          };
        }
        if (log.action.includes('BACKUP')) {
          return {
            type: 'BACKUP_COMPLETED',
            text: 'Business backup completed',
            meta: metaFromDescription || actorName,
            tone: 'success',
          };
        }
        return {
          type: 'OTHER',
          text: log.description || log.action,
          meta: actorName,
          tone: 'primary',
        };
    }
  }

  private buildHealth(input: {
    attentionCount: number;
    avgUsersPerBusiness: number;
    backupsThisWeek: number;
    lastBackupAt: string | null;
    totalBusinesses: number;
  }) {
    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    let message = 'No critical alerts';

    if (input.attentionCount >= 10) {
      status = 'CRITICAL';
      message = `${input.attentionCount} items need attention`;
    } else if (input.attentionCount > 0) {
      status = 'DEGRADED';
      message = `${input.attentionCount} item(s) need attention`;
    }

    if (input.totalBusinesses > 0 && !input.lastBackupAt) {
      status = status === 'HEALTHY' ? 'DEGRADED' : status;
      message =
        status === 'CRITICAL'
          ? message
          : 'No completed backups yet · review backup schedule';
    } else if (input.backupsThisWeek > 0 && input.attentionCount === 0) {
      message = 'Backups running · no critical alerts';
    }

    return {
      status,
      attentionCount: input.attentionCount,
      avgUsersPerBusiness: input.avgUsersPerBusiness,
      message,
    };
  }
}
