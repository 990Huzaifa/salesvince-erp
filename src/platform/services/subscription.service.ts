import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Subscription, SubscriptionAddon } from "src/master-db/entities/subscription.entity";
import { Repository } from "typeorm";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";
import { UpdateSubscriptionDto } from "../dto/subscription/update-subscription.dto";
import { Addon } from "src/master-db/entities/addon.entity";
import { Plan } from "src/master-db/entities/plan.entity";

@Injectable()
export class SubscriptionService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        private readonly activityLogService: ActivityLogService,

        @InjectRepository(Addon)
        private readonly addonRepo: Repository<Addon>,
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,

        @InjectRepository(SubscriptionAddon)
        private readonly subscriptionAddonRepo: Repository<SubscriptionAddon>,
    ) {
    }

    private async recordAction(action: string, description: string, actorId:string , metadata?: Record<string, any> ) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getSubscriptions(page: number = 1, limit: number = 10, userId:string) {
        const skip = (page - 1) * limit;
        const [subscriptions, total] = await this.subscriptionRepo.findAndCount({
            order: { createdAt: 'DESC' },
            relations: ['tenant', 'plan', 'subscriptionAddons'],
            select: {
                id: true,
                status: true,
                cancelledAt: true,
                expiresAt: true,
                createdAt: true,
                updatedAt: true,
                tenant: {
                    id: true,
                    name: true,
                },
                plan: {
                    id: true,
                    title: true,
                }
            },
            skip,
            take: limit,
        });
        await this.recordAction('SUBSCRIPTION_LIST', 'Subscription list fetched', userId, { page, limit, total });
        return {
            data: subscriptions,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getSubscriptionById(id: number, userId:string) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { id },
            relations: ['plan', 'tenant', 'subscriptionAddons', 'subscriptionAddons.addon'],
        });
        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }
        await this.recordAction('SUBSCRIPTION_GET', 'Subscription fetched', userId, { subscriptionId: id });
        return subscription;
    }

    async updateSubscription(id: number, dto: UpdateSubscriptionDto, userId:string) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { id },
        });
        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }
        Object.assign(subscription, dto);
        await this.subscriptionRepo.save(subscription);
        await this.recordAction('SUBSCRIPTION_UPDATE', 'Subscription updated', userId, { subscriptionId: id });
        return subscription;
    }



    // for addons

    async addAddonToSubscription(subscriptionId: number, data: any, userId:string) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { id: subscriptionId },
        });
        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }
        const addon = await this.addonRepo.findOne({
            where: { id: data.addonId },
        });

        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        
        const subscriptionAddon = await this.subscriptionAddonRepo.create({
            subscription,
            addon,
            quantity: data.quantity,
        });
        await this.subscriptionAddonRepo.save(subscriptionAddon);
        await this.recordAction('SUBSCRIPTION_ADDON_ADD', 'Addon added to subscription', userId, { subscriptionId, addonId: data.addonId, quantity: data.quantity });
        return subscriptionAddon;
    }

    async removeAddonFromSubscription(subscriptionId: number, addonId: number, userId:string) {
        const subscriptionAddon = await this.subscriptionAddonRepo.findOne({
            where: { subscription: { id: subscriptionId }, addon: { id: addonId } },
        });
        if (!subscriptionAddon) {
            throw new NotFoundException('Addon not found in subscription');
        }
        await this.subscriptionAddonRepo.remove(subscriptionAddon);
        await this.recordAction('SUBSCRIPTION_ADDON_REMOVE', 'Addon removed from subscription', userId, { subscriptionId, addonId });
        return "Addon removed from subscription";
    }


    // for plan

    async updateSubscriptionPlan(subscriptionId: number, planId: any, user: any) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { id: subscriptionId },
            relations: ['plan'],
        });
        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }
        let planIdString = planId.toString();
        const plan = await this.planRepo.findOne({
            where: { id: planIdString },
        });
        if (!plan) {
            throw new NotFoundException('Plan not found');
        }
        subscription.plan = plan;
        await this.subscriptionRepo.update(subscriptionId, { plan: plan });
        await this.recordAction('SUBSCRIPTION_PLAN_UPDATE', 'Subscription plan updated', user.id, { subscriptionId, planIdString });
        return {
            message: 'Subscription plan updated',
            subscription: subscription
        };
    }
}