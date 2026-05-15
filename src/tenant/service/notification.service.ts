import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { PusherService } from "src/common/pusher/pusher.service";
import { ActivityLogService } from "src/platform/services/activity-log.service";
import { User } from "src/tenant-db/entities/user.entity";
import { Notification } from "src/tenant-db/entities/notification.entity";
import { CreateNotificationDto } from "../dto/notification/create-notification.dto";

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        private readonly pusherService: PusherService,
    ) {}

    async getUserNotifications(tenantDb: DataSource, userId: string) {
        const notifications = await tenantDb.getRepository(Notification).find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });

        return { result: notifications };
    }

    async createNotification(
        tenantDb: DataSource,
        payload: CreateNotificationDto,
        tenantCode: string,
        realtimePayload?: Record<string, unknown>,
    ) {
        
        const user = await tenantDb.getRepository(User).findOne({
            where: { id: payload.userId },
        });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const notification = tenantDb.getRepository(Notification).create({
            userId: payload.userId,
            user,
            title: payload.title,
            message: payload.message,
            type: payload.type,
            isRead: payload.isRead ?? false,
        });

        const saved = await tenantDb.getRepository(Notification).save(notification);

        try {
            await this.pusherService.trigger(
                `private-tenant-${tenantCode}-user-${user.id}`,
                'notification.new',
                {
                    message: saved,
                    ...(realtimePayload ? { data: realtimePayload } : {}),
                },
            );
        } catch (err) {
            this.logger.warn(
                `Pusher trigger failed for user ${user.id}; notification persisted. ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        return saved;
    }

    async generateNotification(tenantDb: DataSource, payload: CreateNotificationDto, tenantCode: string) {
        // to all user users
        const users = await tenantDb.getRepository(User).find();
        for (const user of users) {
            await this.createNotification(tenantDb, {
                userId: user.id,
                title: payload.title,
                message: payload.message,
                type: payload.type,
            }, tenantCode);
                
            try {
                await this.pusherService.trigger(`tenant-user`, 'notification.new', {
                    message: `New notification: ${payload.title}`,
                });
            } catch (err) {
                this.logger.warn(
                    `Pusher broadcast failed (tenant-user). ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    async markAsRead(tenantDb: DataSource, id: string) {
        const notification = await tenantDb.getRepository(Notification).findOne({
            where: { id },
        });

        if (!notification) {
            throw new NotFoundException("Notification not found");
        }

        notification.isRead = true;
        return tenantDb.getRepository(Notification).save(notification);
    }
}
