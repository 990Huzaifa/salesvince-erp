import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Notification } from "src/master-db/entities/notification.entity";
import { PlatformUser } from "src/master-db/entities/platform-user.entity";
import { Repository } from "typeorm";
import { CreateNotificationDto } from "../dto/notification/create-notification.dto";
import { PusherService } from "src/common/pusher/pusher.service";

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
        @InjectRepository(PlatformUser)
        private readonly platformUserRepo: Repository<PlatformUser>,

        private readonly pusherService: PusherService,
    ) { }

    async getUserNotifications(userId: string) {
        const notifications = await this.notificationRepo.find({
            where: { userId: userId },
            order: { createdAt: "DESC" },
        });

        return { result: notifications };
    }

    async createNotification(payload: CreateNotificationDto) {
        const user = await this.platformUserRepo.findOne({
            where: { id: payload.userId },
        });

        if (!user) {
            throw new NotFoundException("Platform user not found");
        }

        const notification = this.notificationRepo.create({
            userId: payload.userId,
            user,
            title: payload.title,
            message: payload.message,
            type: payload.type,
            isRead: payload.isRead ?? false,
        });

        const saved = await this.notificationRepo.save(notification);

        try {
            await this.pusherService.trigger(
                `private-platform-user-${user.id}`,
                'notification.new',
                { message: saved },
            );
        } catch (err) {
            this.logger.warn(
                `Pusher trigger failed for user ${user.id}; notification persisted. ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        return saved;
    }

    async generateNotification(payload: CreateNotificationDto) {
        // to all platform users
        const users = await this.platformUserRepo.find();
        for (const user of users) {
            await this.createNotification({
                userId: user.id,
                title: payload.title,
                message: payload.message,
                type: payload.type,
            });

            try {
                await this.pusherService.trigger(`platform-user`, 'notification.new', {
                    message: `New notification: ${payload.title}`,
                });
            } catch (err) {
                this.logger.warn(
                    `Pusher broadcast failed (platform-user). ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    async markAsRead(id: string) {
        const notification = await this.notificationRepo.findOne({
            where: { id },
        });

        if (!notification) {
            throw new NotFoundException("Notification not found");
        }

        notification.isRead = true;
        return this.notificationRepo.save(notification);
    }
}
