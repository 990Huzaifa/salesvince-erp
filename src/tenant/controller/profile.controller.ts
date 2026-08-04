import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ProfileService } from '../service/profile.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';
import { ChangePasswordDto } from '../dto/profile/change-password.dto';
import { CreatePinDto } from '../dto/profile/create-pin.dto';

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

/** API base URL for email links (must hit Nest, not the SPA Origin). */
const resolveApiBaseUrl = (req: Request): string | undefined => {
  const fromEnv = process.env.API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  const proto =
    getRequestHeader(req, ['x-forwarded-proto']) ||
    (req.protocol ? req.protocol : 'https');
  const host = getRequestHeader(req, [
    'x-original-host',
    'x-forwarded-host',
    'host',
  ]);
  if (!host) {
    return undefined;
  }
  return `${proto}://${host}`.replace(/\/+$/, '');
};

@Controller('tenant/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('pin/reset/confirm')
  confirmResetPin(
    @Query('token') token: string,
    @Query('tenantCode') tenantCode: string | undefined,
    @Res() res: Response,
  ) {
    return this.profileService.confirmResetPin(token, tenantCode, res);
  }

  @Get()
  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
  getProfile(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    return this.profileService.getProfile(
      tenantDb,
      req.user as TenantRequestUser,
    );
  }

  @Patch()
  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
  updateProfile(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.profileService.updateProfile(
      tenantDb,
      req.user as TenantRequestUser,
      dto,
    );
  }

  @Post('change-password')
  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
  changePassword(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.profileService.changePassword(
      tenantDb,
      req.user as TenantRequestUser,
      dto,
    );
  }

  @Post('pin')
  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
  createPin(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePinDto,
    @Req() req: Request,
  ) {
    return this.profileService.createPin(
      tenantDb,
      req.user as TenantRequestUser,
      dto,
    );
  }

  @Post('pin/reset')
  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
  resetPin(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    return this.profileService.resetPin(
      tenantDb,
      req.user as TenantRequestUser,
      resolveApiBaseUrl(req),
    );
  }
}
