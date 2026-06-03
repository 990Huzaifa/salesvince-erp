import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantLoginOnlyGuard } from 'src/auth/tenant-login-only.guard';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';
import { SelectBusinessDto } from '../dto/select-business.dto';
import { PusherService } from 'src/common/pusher/pusher.service';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { TenantAuthService } from 'src/tenant/service/tenant-auth.service';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { User } from 'src/tenant-db/entities/user.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
const getRequestHeader = (req: Request, names: string[]): string | undefined => {
  for (const name of names) {
    const value = req.headers[name];
    if (!value) {
      continue;
    }
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) {
      return headerValue.split(',')[0].trim();
    }
  }
  return undefined;
};

const resolveTenantHost = (
  origin?: string,
  referer?: string,
  host?: string,
): string | undefined => {
  const source = origin || referer;
  if (!source) {
    return host;
  }

  try {
    return new URL(source).host;
  } catch {
    return host;
  }
};

@Controller('tenant/auth')
export class TenantAuthController {
  constructor(
    private readonly tenantAuthService: TenantAuthService,
    private readonly pusherService: PusherService,
  ) {}

  @Post('login')
  login(@Body() dto: TenantLoginDto, @Req() req: Request) {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, [
      'x-original-host',
      'x-forwarded-host',
      'host',
    ]);
    return this.tenantAuthService.login(
      dto,
      resolveTenantHost(origin, referer, host),
    );
  }

  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard, TenantLoginOnlyGuard)
  @Post('select-business')
  selectBusiness(@Body() dto: SelectBusinessDto, @Req() req: Request) {
    const user = req.user as TenantRequestUser;
    return this.tenantAuthService.selectBusiness(dto, {
      userId: user.userId,
      userCode: user.userCode,
      userName: user.userName,
      userEmail: user.userEmail,
      lastLoginAt: user.lastLoginAt,
      tenantId: user.tenantId,
      tokenType: user.tokenType,
    });
  }

  @Post('setup-password')
  setupPassword(@Body() dto: SetupTenantUserPasswordDto, @Req() req: Request) {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, [
      'x-original-host',
      'x-forwarded-host',
      'host',
    ]);
    return this.tenantAuthService.setupInvitedUserPassword(
      dto,
      resolveTenantHost(origin, referer, host),
    );
  }

  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard, TenantBusinessAccessGuard)
  @Post('pusher')
  async pusherAuth(@Req() req: Request, @Res() res: Response) {
    const socketId = (req.body as { socket_id?: string }).socket_id;
    const channel = (req.body as { channel_name?: string }).channel_name;
    const user = req.user as TenantRequestUser;

    let userCode = user.userCode;
    let businessCode = user.businessCode;
    if (req.tenantDb) {
      if (!userCode) {
        const row = await req.tenantDb
          .getRepository(User)
          .findOne({ where: { id: user.userId }, select: ['code'] });
        userCode = row?.code;
      }
      if (!businessCode && user.businessId) {
        const row = await req.tenantDb
          .getRepository(Business)
          .findOne({ where: { id: user.businessId }, select: ['code'] });
        businessCode = row?.code;
      }
    }

    if (!user.tenantCode || !userCode) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const baseChannel = `private-tenant-${user.tenantCode}-user-${userCode}`;
    const withBusiness = businessCode
      ? `${baseChannel}-business-${businessCode}`
      : null;

    const notificationChannelAllowed =
      channel === baseChannel ||
      (withBusiness != null && channel === withBusiness);

    if (notificationChannelAllowed) {
      const auth = this.pusherService.authorizeChannel(
        socketId as string,
        channel as string,
      );
      return res.status(200).json(auth);
    }

    return res.status(403).json({ message: 'Unauthorized' });
  }
}
