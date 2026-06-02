import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/common/mail/mail.service';
import { User, UserStatus } from 'src/tenant-db/entities/user.entity';
import { Role } from 'src/tenant-db/entities/role.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
import {
  UserBusiness,
  UserBusinessStatus,
} from 'src/tenant-db/entities/user-business.entity';
import { CreateTenantUserDto } from '../dto/user/create-tenant-user.dto';
import { InviteTenantUserDto } from '../dto/user/invite-tenant-user.dto';
import { ResendInviteTenantUserDto } from '../dto/user/resend-invite-tenant-user.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class UserService {
  constructor(
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private async generateUniqueUserCode(userRepo: Repository<User>): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await userRepo.findOne({ where: { code }, select: ['id'] });
      if (!existing) {
        return code;
      }
    }
  }

  private buildUserSetupUrl(
    userCode: string,
    token: string,
    tenantCode?: string,
    requestBaseUrl?: string,
  ) {
    const baseUrl = (requestBaseUrl || process.env.TENANT_SETUP_BASE_URL || '')
      .replace(/\/+$/, '');
    const query = new URLSearchParams();
    query.set('token', token);
    if (tenantCode) {
      query.set('tenantCode', tenantCode);
    }
    return `${baseUrl}/tenant/users/${userCode}/setup?${query.toString()}`;
  }

  private async sendInviteEmail(
    user: User,
    tenantCode?: string,
    tenantName?: string,
    requestBaseUrl?: string,
  ): Promise<string> {
    const token = this.jwtService.sign(
      {
        type: 'tenant_user_invite',
        userId: user.id,
        userCode: user.code,
        email: user.email,
      },
      { expiresIn: '7d' },
    );

    const setupUrl = this.buildUserSetupUrl(user.code, token, tenantCode, requestBaseUrl);
    const emailHtml = this.mailService.renderTenantUserInviteTemplate({
      logoUrl: process.env.APP_LOGO_URL || 'https://snd.com/logo.png',
      invitedByName: 'your administrator',
      tenantName: tenantName || 'your tenant',
      setupUrl,
      year: new Date().getFullYear(),
    });

    await this.mailService.sendEmail(
      user.email,
      `You're invited to ${tenantName || 'SalesVince'}`,
      emailHtml,
      'noreply@salesvince.com',
    );

    return setupUrl;
  }

  async listUsers(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    sort: string,
    sortDirection: string,
    roleId: string | null,
    _designationId: string | null,
    user: { userId: string, businessId: string },
  ) {
    const userRepo = tenantDb.getRepository(User);

    const qb = userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.userBusinesses', 'ub', 'ub.deletedAt IS NULL')
      .leftJoinAndSelect('ub.business', 'b')
      .leftJoinAndSelect('ub.role', 'r')
      .where('u.deletedAt IS NULL')
      .andWhere('u.id != :currentId', { currentId: user.userId })
      .andWhere('u.name ILIKE :search', { search: `%${search}%` });

    if (roleId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM user_businesses ub2 WHERE ub2."userId" = u.id AND ub2."deletedAt" IS NULL AND ub2."roleId" = :roleId)`,
        { roleId },
      );
    }

    const orderCol = ['name', 'email', 'createdAt'].includes(sort) ? sort : 'createdAt';
    const dir = sortDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`u.${orderCol}`, dir);

    const totalUsers = await userRepo.count({ where: { deletedAt: IsNull() } });
    const totalActiveUsers = await userRepo.count({
      where: { deletedAt: IsNull(), status: UserStatus.ACTIVE },
    });
    const totalInactiveUsers = await userRepo.count({
      where: { deletedAt: IsNull(), status: UserStatus.INACTIVE },
    });

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    qb.skip(skip).take(Math.max(1, Number(limit)));

    const countQb = userRepo
      .createQueryBuilder('u')
      .where('u.deletedAt IS NULL')
      .andWhere('u.id != :currentId', { currentId: user.userId })
      .andWhere('u.name ILIKE :search', { search: `%${search}%` });
    if (roleId) {
      countQb.innerJoin('u.userBusinesses', 'ubc', 'ubc.deletedAt IS NULL AND ubc.roleId = :roleId', {
        roleId,
      });
    }
    const total = await countQb.getCount();

    const users = await qb.getMany();

    users.forEach((u) => {
      delete (u as { password?: string }).password;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'USER_LISTED',
      description: 'Users listed',
      metadata: { total, page, limit },
    });

    return {
      result: users,
      totalUsers,
      totalActiveUsers,
      totalInactiveUsers,
      meta: { total, page: Number(page), limit: Number(limit) },
    };
  }

  async getUserById(tenantDb: DataSource, id: string, authUser: { userId: string, businessId: string }) {
    const userRepo = tenantDb.getRepository(User);
    const found = await userRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['userBusinesses', 'userBusinesses.business', 'userBusinesses.role', 'userBusinesses.role.rolePermissions', 'userBusinesses.role.rolePermissions.permission'],
    });
    if (!found) {
      throw new NotFoundException('User not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId,
      action: 'USER_VIEWED',
      description: `User ${found.email} viewed`,
      metadata: { userId: found.id },
    });

    delete (found as { password?: string }).password;
    return found;
  }

  async createUser(
    tenantDb: DataSource,
    tenantCode: string,
    dto: CreateTenantUserDto,
    authUser: { userId: string, businessId: string },
  ) {
    const userRepo = tenantDb.getRepository(User);
    const roleRepo = tenantDb.getRepository(Role);
    const businessRepo = tenantDb.getRepository(Business);
    const ubRepo = tenantDb.getRepository(UserBusiness);

    const code = await this.generateUniqueUserCode(userRepo);
    const email = dto.email.trim().toLowerCase();

    const existingByEmail = await userRepo.findOne({
      where: { email, deletedAt: IsNull() },
      select: ['id'],
    });
    if (existingByEmail) {
      throw new ConflictException('User with this email already exists');
    }

    const business = await businessRepo.findOne({
      where: { id: dto.businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const role = await roleRepo.findOne({
      where: { id: dto.roleId, deletedAt: IsNull() },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const user = userRepo.create({
      code,
      name: dto.name.trim(),
      email,
      password: await bcrypt.hash(dto.password, 10),
      phone: dto.phone?.trim(),
      avatar: dto.avatar?.trim() ?? null,
      cnic: dto.cnic?.trim() ?? null,
      address: dto.address ?? null,
      fcmToken: dto.fcmToken ?? null,
      deviceId: dto.deviceId ?? null,
      status: dto.isActive === false ? UserStatus.INACTIVE : UserStatus.ACTIVE,
    });

    const createdUser = await userRepo.save(user);
    
    const ub = ubRepo.create({
      userId: createdUser.id,
      businessId: dto.businessId,
      roleId: dto.roleId,
      status: UserBusinessStatus.ACTIVE,
    });
    await ubRepo.save(ub);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId,
      action: 'USER_CREATED',
      description: `User ${createdUser.email} created`,
      metadata: { userId: createdUser.id, businessId: dto.businessId, roleId: dto.roleId },
    });

    delete (createdUser as { password?: string }).password;
    return createdUser;
  }

  async updateUserStatus(
    tenantDb: DataSource,
    id: string,
    active: boolean,
    authUser: { userId: string, businessId: string },
  ) {
    const userRepo = tenantDb.getRepository(User);
    const found = await userRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!found) {
      throw new NotFoundException('User not found');
    }
    found.status = active ? UserStatus.ACTIVE : UserStatus.INACTIVE;
    await userRepo.save(found);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId,
      action: 'USER_STATUS_UPDATED',
      description: `User ${found.email} status updated`,
      metadata: { userId: found.id, status: found.status },
    });

    return { message: 'User status updated successfully', user: found };
  }

  async updateUserAvatar(
    tenantDb: DataSource,
    _tenantCode: string,
    userId: string,
    avatar: string | null,
    authUser: { userId: string, businessId: string },
  ) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId, deletedAt: IsNull() } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.avatar = avatar?.trim() ?? null;
    await userRepo.save(user);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId,
      action: 'USER_AVATAR_UPDATED',
      description: `User ${user.email} avatar updated`,
      metadata: { userId: user.id },
    });

    delete (user as { password?: string }).password;
    return user;
  }

  async inviteUser(
    tenantDb: DataSource,
    dto: InviteTenantUserDto,
    tenantCode?: string,
    tenantName?: string,
    requestBaseUrl?: string,
    authUser?: { userId: string, businessId: string },
  ) {
    const userRepo = tenantDb.getRepository(User);
    const roleRepo = tenantDb.getRepository(Role);
    const businessRepo = tenantDb.getRepository(Business);
    const ubRepo = tenantDb.getRepository(UserBusiness);

    const email = dto.email.trim().toLowerCase();

    const business = await businessRepo.findOne({
      where: { id: dto.businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const role = await roleRepo.findOne({
      where: { id: dto.roleId, deletedAt: IsNull() },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    let user = await userRepo.findOne({
      where: { email, deletedAt: IsNull() },
    });

    if (!user) {
      user = userRepo.create({
        code: await this.generateUniqueUserCode(userRepo),
        name: email.split('@')[0],
        email,
        password: null,
        status: UserStatus.ACTIVE,
      });
      user = await userRepo.save(user);
    } else if (user.password) {
      throw new ConflictException('User already has an active account');
    }

    let ub = await ubRepo.findOne({
      where: { userId: user.id, businessId: dto.businessId, deletedAt: IsNull() },
    });
    if (ub) {
      ub.roleId = dto.roleId;
      ub.status = UserBusinessStatus.ACTIVE;
      await ubRepo.save(ub);
    } else {
      ub = ubRepo.create({
        userId: user.id,
        businessId: dto.businessId,
        roleId: dto.roleId,
        status: UserBusinessStatus.ACTIVE,
      });
      await ubRepo.save(ub);
    }

    const setupUrl = await this.sendInviteEmail(user, tenantCode, tenantName, requestBaseUrl);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser?.userId ?? null,
      businessId: authUser?.businessId ?? dto.businessId,
      action: 'USER_INVITED',
      description: `Invitation sent to ${user.email}`,
      metadata: { userId: user.id, email: user.email, businessId: dto.businessId },
    });

    return {
      message: 'Invitation sent successfully',
      userCode: user.code,
      email: user.email,
      setupUrl,
    };
  }

  async resendInviteUser(
    tenantDb: DataSource,
    dto: ResendInviteTenantUserDto,
    tenantCode?: string,
    tenantName?: string,
    requestBaseUrl?: string,
    authUser?: { userId: string, businessId: string },
  ) {
    const userRepo = tenantDb.getRepository(User);

    const user = await userRepo.findOne({
      where: { id: dto.userId, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.password) {
      throw new ConflictException('User already has an active account');
    }

    const setupUrl = await this.sendInviteEmail(user, tenantCode, tenantName, requestBaseUrl);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser?.userId ?? null,
      businessId: authUser?.businessId ?? null,
      action: 'USER_INVITE_RESENT',
      description: `Invitation resent to ${user.email}`,
      metadata: { userId: user.id, email: user.email },
    });

    return {
      message: 'Invitation resent successfully',
      userCode: user.code,
      email: user.email,
      setupUrl,
    };
  }
}
