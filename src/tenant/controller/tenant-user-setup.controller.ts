import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SetupTenantUserDto } from '../dto/user/setup-tenant-user.dto';
import { TenantAuthService } from '../service/tenant-auth.service';

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

@Controller('tenant/users')
export class TenantUserSetupController {
  constructor(private readonly tenantAuthService: TenantAuthService) {}

  @Post(':code/setup')
  setup(
    @Param('code') code: string,
    @Body() dto: SetupTenantUserDto,
    @Req() req: Request,
  ) {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, [
      'x-original-host',
      'x-forwarded-host',
      'host',
    ]);

    return this.tenantAuthService.setupInvitedUser(
      code,
      dto,
      resolveTenantHost(origin, referer, host),
    );
  }
}
