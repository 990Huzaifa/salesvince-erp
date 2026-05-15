import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { ActivityLogService } from '../services/activity-log.service';

@Controller('platform/activity-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ActivityLogController {
    constructor(
        private readonly activityLogService: ActivityLogService,
    ) { }

    @Get('/')
    async list(
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.activityLogService.listActivityLogs(page ?? 1, limit ?? 10);
    }

    @Get(':id')
    async view(@Param('id') id: string) {
        return this.activityLogService.viewActivityLog(id);
    }
}
