import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { ProfileService } from '../service/profile.service';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';
import { ChangePasswordDto } from '../dto/profile/change-password.dto';

@Controller('tenant/profile')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    return this.profileService.getProfile(
      tenantDb,
      req.user as { userId: string; businessId?: string },
    );
  }

  @Patch()
  updateProfile(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.profileService.updateProfile(
      tenantDb,
      req.user as { userId: string; businessId?: string },
      dto,
    );
  }

  @Post('change-password')
  changePassword(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.profileService.changePassword(
      tenantDb,
      req.user as { userId: string; businessId?: string },
      dto,
    );
  }
}
