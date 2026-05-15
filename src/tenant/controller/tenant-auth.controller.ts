import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantAuthService } from '../service/tenant-auth.service';
import { TenantLoginDto } from '../dto/tenant-login.dto';
import { SetupTenantUserPasswordDto } from '../dto/user/setup-tenant-user-password.dto';
import { PusherService } from 'src/common/pusher/pusher.service';

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
  login(
    @Body() dto: TenantLoginDto,
    @Req() req: Request,
  ): Promise<{ access_token: string }> {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, ['x-original-host', 'x-forwarded-host', 'host']);
    return this.tenantAuthService.login(dto, resolveTenantHost(origin, referer, host));
  }

  @Post('setup-password')
  setupPassword(
    @Body() dto: SetupTenantUserPasswordDto,
    @Req() req: Request,
  ) {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, ['x-original-host', 'x-forwarded-host', 'host']);
    return this.tenantAuthService.setupInvitedUserPassword(
      dto,
      resolveTenantHost(origin, referer, host),
    );
  }

  @UseGuards(TenantJwtAuthGuard)
  @Post('pusher')
  async pusherAuth(@Req() req: Request, @Res() res: any) {
    
    const socketId = (req.body as { socket_id?: string }).socket_id;
    const channel = (req.body as { channel_name?: string }).channel_name;
    const user = req.user as { userId?: string; sub?: string; tenantCode?: string };
    const userId = user.userId ?? user.sub;

    if (!channel?.includes(`private-tenant-${user.tenantCode}-user-${userId}`)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const auth = this.pusherService.authorizeChannel(socketId as string, channel);
    return res.status(200).json(auth);
  }
}
