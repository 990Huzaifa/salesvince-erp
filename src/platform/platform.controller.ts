import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, UseGuards, Put, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { ResolveTenantDto } from './dto/resolve-tenant.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateTenantThemeDto } from './dto/update-tenant-theme.dto';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { PermissionGuard } from 'src/auth/permission.guard';
import { FileUploadService } from './services/file-upload.service';
import { CurrentPlatformUser } from 'src/auth/current-platform-user.decorator';
import { Req } from '@nestjs/common';
import { UpdateTenantGeoPolicyDto } from './dto/update-tenant-geo-policy.dto';

@Controller('platform/tenant')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
  ) {}

  @Post('resolve')
  async resolve(@Body() dto: ResolveTenantDto) {
    const tenant = await this.platformService.resolveTenant(dto.code);

    if(!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const domain = process.env.DOMAIN; 
    return {
      tenantCode: tenant.code,
      tenantName: tenant.name,
      appUrl: `https://${tenant.name}.${domain}`,
    };
  }

  @RequirePermissions('TENANT_CREATE')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Post()
  async createTenant(@Body() dto: CreateTenantDto,@CurrentPlatformUser() user: any) {
    const tenant = await this.platformService.createTenant(dto,user);

    return {
      tenantName: tenant.name,
      email: tenant.email,
      tenantCode: tenant.code,
      appUrl: `https://${tenant.name}.${process.env.DOMAIN}`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/retry-provisioning')
  async retryTenantProvisioning(@Param('id') tenantId: string, @Req() req: any) {
    return this.platformService.retryProvisioning(tenantId, req.user);
  }

  @RequirePermissions('TENANT_VIEW')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get('/provisioning')
  async provisioning(@Req() req: any) {
    return this.platformService.getProvisioningList(req.user);
  }

  @RequirePermissions('TENANT_VIEW')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Get(':id')
  async getTenant(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getTenant(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/provisioning/:id')
  async provisioningDetails(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getProvisioningDetails(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/suspend')
  async suspend(@Param('id') id: string, @Req() req: any) {
    return this.platformService.suspendTenant(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/resume')
  async resume(@Param('id') id: string, @Req() req: any) {
    return this.platformService.resumeTenant(id, req.user);
  }


  @UseGuards(JwtAuthGuard)
  @Get(':id/profile')
  async getProfile(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getTenantProfile(id, req.user );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/profile')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateTenantProfileDto, @Req() req: any) {
    return this.platformService.updateTenantProfile(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/settings')
  async getSettings(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getTenantSettings(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/settings')
  async updateSettings(@Param('id') id: string, @Body() dto: UpdateTenantSettingsDto, @Req() req: any) {
    return this.platformService.updateTenantSettings(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/themes')
  async getThemes(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getTenantThemes(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/themes')
  async getTheme(@Param('id') id: string, @Body() dto: UpdateTenantThemeDto, @Req() req: any) {
    return this.platformService.updateTenantThemes(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/profile/logo')
  @UseInterceptors(FileInterceptor('logo', FileUploadService.prototype.multerConfig))
  async uploadLogo(@Param('id') id: string, @UploadedFile() logo: Express.Multer.File, @Req() req: any) {
    return this.platformService.updateTenantLogo(id, logo, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/geo-policy')
  async getGeoPolicy(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getTenantGeoPolicy(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/geo-policy')
  async updateGeoPolicy(@Param('id') id: string, @Body() dto: UpdateTenantGeoPolicyDto, @Req() req: any) {
    return this.platformService.updateTenantGeoPolicy(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/modules')
  async getTenantModules(@Param('id') id: string, @Req() req: any) {
    return this.platformService.getTenantModules(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/modules/:moduleId/status')
  async updateTenantModuleStatus(@Param('id') id: string, @Param('moduleId') moduleId: string, @Query('isActive') isActive: boolean, @Req() req: any) {
    return this.platformService.updateTenantModuleStatus(id, moduleId, isActive, req.user);
  }

}
