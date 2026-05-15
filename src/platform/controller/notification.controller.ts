import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { PermissionGuard } from "src/auth/permission.guard";
import { NotificationService } from "../services/notification.service";
import { CreateNotificationDto } from "../dto/notification/create-notification.dto";
import { CurrentPlatformUser } from "src/auth/current-platform-user.decorator";

@Controller("platform/notifications")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class NotificationController {
    constructor(
        private readonly notificationService: NotificationService,
    ) { }

    @Get("/")
    async getUserNotifications(@CurrentPlatformUser() user: any) {
        return this.notificationService.getUserNotifications(user.id);
    }

    @Post("/")
    async createNotification(@Body() payload: CreateNotificationDto) {
        return this.notificationService.createNotification(payload);
    }

    @Put(":id/read")
    async markAsRead(@Param("id") id: string) {
        return this.notificationService.markAsRead(id);
    }
}
