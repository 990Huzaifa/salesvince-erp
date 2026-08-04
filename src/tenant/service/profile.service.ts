import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { User } from 'src/tenant-db/entities/user.entity';
import { Tenant, TenantStatus } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { MailService } from 'src/common/mail/mail.service';
import { PusherService } from 'src/common/pusher/pusher.service';
import { buildTenantUserPusherChannel } from '../utils/tenant-pusher-channel';
import { ActivityLogService } from './activity-log.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';
import { ChangePasswordDto } from '../dto/profile/change-password.dto';
import { CreatePinDto } from '../dto/profile/create-pin.dto';

type AuthUser = {
  userId: string;
  businessId?: string;
  tenantId?: string;
  tenantCode?: string;
  userCode?: string;
};

type PinResetTokenPayload = {
  type?: string;
  userId?: string;
  userCode?: string;
  email?: string;
  tenantId?: string;
  tenantCode?: string;
};

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly pinResetDeeplink = 'salesvince://pin-reset';

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly pusherService: PusherService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

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
    if (dto.appVersion !== undefined) {
      user.appVersion = dto.appVersion?.trim() ?? null;
    }

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
      throw new BadRequestException(
        'New password must be different from current password',
      );
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

  async createPin(
    tenantDb: DataSource,
    authUser: AuthUser,
    dto: CreatePinDto,
  ) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: authUser.userId, deletedAt: IsNull() },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.pin != null) {
      throw new BadRequestException('PIN already exists. Reset PIN first.');
    }

    user.pin = Number(dto.pin);
    await userRepo.save(user);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId ?? null,
      action: 'PROFILE_PIN_CREATED',
      description: 'PIN created',
      metadata: { userId: user.id },
    });

    return { message: 'PIN created successfully' };
  }

  async resetPin(
    tenantDb: DataSource,
    authUser: AuthUser,
    requestBaseUrl?: string,
  ) {
    if (!authUser.tenantId || !authUser.tenantCode) {
      throw new BadRequestException('Tenant context is required');
    }

    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: authUser.userId, deletedAt: IsNull() },
      select: ['id', 'code', 'name', 'email', 'pin'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.pin == null) {
      throw new BadRequestException('PIN is not set');
    }

    if (!user.email) {
      throw new BadRequestException('User email is required to reset PIN');
    }

    const token = this.jwtService.sign(
      {
        type: 'tenant_pin_reset',
        userId: user.id,
        userCode: user.code,
        email: user.email,
        tenantId: authUser.tenantId,
        tenantCode: authUser.tenantCode,
      },
      { expiresIn: '15m' },
    );

    const apiBase = (requestBaseUrl || process.env.API_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '');

    if (!apiBase) {
      throw new BadRequestException(
        'API base URL is not configured for PIN reset emails',
      );
    }

    const query = new URLSearchParams({
      token,
      tenantCode: authUser.tenantCode,
    });
    const resetUrl = `${apiBase}/tenant/profile/pin/reset/confirm?${query.toString()}`;

    const logoUrl = process.env.APP_LOGO_URL || 'https://snd.com/logo.png';
    const bodyHtml = this.mailService.renderResetPinTemplate({
      logoUrl,
      name: user.name,
      resetUrl,
      year: new Date().getFullYear(),
    });

    await this.mailService.sendEmail(
      user.email,
      'Reset Your PIN - SalesVince',
      bodyHtml,
      'noreply@salesvince.com',
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: authUser.userId,
      businessId: authUser.businessId ?? null,
      action: 'PROFILE_PIN_RESET_REQUESTED',
      description: 'PIN reset email sent',
      metadata: { userId: user.id },
    });

    return {
      message: 'PIN reset link has been sent to your email.',
    };
  }

  private verifyPinResetToken(token: string): PinResetTokenPayload {
    let payload: PinResetTokenPayload;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      }) as PinResetTokenPayload;
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }

    if (payload.type !== 'tenant_pin_reset') {
      throw new BadRequestException('Invalid token type');
    }

    if (
      !payload.userId ||
      !payload.userCode ||
      !payload.email ||
      !payload.tenantId ||
      !payload.tenantCode
    ) {
      throw new BadRequestException('Invalid token payload');
    }

    return payload;
  }

  private pinResetResultHtml(ok: boolean): string {
    const title = ok ? 'PIN cleared' : 'PIN reset failed';
    const body = ok
      ? 'Your PIN has been cleared. You can close this page and set a new PIN in the app.'
      : 'This reset link is invalid or has expired. Please request a new PIN reset from the app.';
    const deeplink = ok
      ? `${this.pinResetDeeplink}?status=cleared`
      : `${this.pinResetDeeplink}?status=failed`;

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta http-equiv="refresh" content="0;url=${deeplink}"/>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;margin:0;padding:40px;text-align:center;color:#2c3e50;">
  <h2>${title}</h2>
  <p style="color:#555;">${body}</p>
  <p style="font-size:13px;color:#888;"><a href="${deeplink}">Open app</a></p>
</body></html>`;
  }

  async confirmResetPin(
    token: string,
    tenantCodeFromQuery: string | undefined,
    res: Response,
  ) {
    try {
      if (!token?.trim()) {
        throw new BadRequestException('Token is required');
      }

      const payload = this.verifyPinResetToken(token);

      if (
        tenantCodeFromQuery?.trim() &&
        tenantCodeFromQuery.trim() !== payload.tenantCode
      ) {
        throw new BadRequestException('Tenant code mismatch');
      }

      const tenant = await this.tenantRepo.findOne({
        where: {
          id: payload.tenantId,
          code: payload.tenantCode,
          isActive: true,
        },
      });

      if (!tenant || tenant.status !== TenantStatus.PROVISIONED) {
        throw new BadRequestException('Tenant not available');
      }

      const tenantDb = await this.tenantConnectionManager.getConnection(
        tenant.id,
      );
      const userRepo = tenantDb.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: payload.userId, deletedAt: IsNull() },
        select: ['id', 'code', 'pin'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Only clear pin — avoid TypeORM save() on a partial entity.
      await userRepo.update({ id: user.id }, { pin: null });

      const channel = buildTenantUserPusherChannel(
        payload.tenantCode!,
        payload.userCode!,
      );

      try {
        await this.pusherService.trigger(channel, 'pin.cleared', {
          userId: user.id,
          message: 'PIN has been cleared',
        });
      } catch (err) {
        this.logger.warn(
          `Pusher pin.cleared failed for user ${user.id}; pin cleared. ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.id,
        businessId: null,
        action: 'PROFILE_PIN_CLEARED',
        description: 'PIN cleared via email link',
        metadata: { userId: user.id },
      });

      return res.status(200).type('html').send(this.pinResetResultHtml(true));
    } catch (err) {
      this.logger.warn(
        `PIN reset confirm failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return res.status(400).type('html').send(this.pinResetResultHtml(false));
    }
  }
}
