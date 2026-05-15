import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Put, Query } from '@nestjs/common';
import { AnnouncementService } from '../services/announcements.service';
import { PermissionGuard } from 'src/auth/permission.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';

@Controller('platform/announcement')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AnnouncementController {

    constructor(
        private readonly announcementService: AnnouncementService
    ) {}

    @Get('/')
    @RequirePermissions('ANNOUNCEMENT_LIST')
    async getAnnouncements(@Query('page') page: number, @Query('limit') limit: number, @Req() req: any) {
        return this.announcementService.getAnnouncements(page, limit, req.user);
    }

    @Get('/:id')
    @RequirePermissions('ANNOUNCEMENT_VIEW')
    async showAnnouncement(@Param('id') id: string,@Req() req: any) {
        return this.announcementService.showAnnouncement(id, req.user);
    }

    @Post('/')
    @RequirePermissions('ANNOUNCEMENT_CREATE')
    async createAnnouncement(@Body() createAnnouncementDto, @Req() req: any) {
        return this.announcementService.createAnnouncement(createAnnouncementDto, req.user);
    }

    @Put('/:id')
    @RequirePermissions('ANNOUNCEMENT_UPDATE')
    async updateAnnouncement(@Param('id') id: string, @Body() updateAnnouncementDto, @Req() req: any) {
        return this.announcementService.updateAnnouncement(id, updateAnnouncementDto, req.user);
    }

    @Put('/:id/status')
    @RequirePermissions('ANNOUNCEMENT_UPDATE')
    async updateAnnouncementStatus(@Query('is_active') is_active: boolean, @Param('id') id: string, @Req() req: any) {
        return this.announcementService.updateAnnouncementStatus(id, is_active, req.user);
    }

}
