import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Plan, PlanLimit } from "src/master-db/entities/plan.entity";
import { Not, Repository } from "typeorm";
import { CreatePlanDto } from "../dto/plan/create-plan.dto";
import { UpdatePlanDto } from "../dto/plan/update-plan.dto";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class PlanService {
    constructor(
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,
        @InjectRepository(PlanLimit)
        private readonly planLimitRepo: Repository<PlanLimit>,
        private readonly activityLogService: ActivityLogService,
    ) { }

    private async recordAction(action: string, description: string, actorId: string, metadata?: Record<string, any>) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getPlans(page = 1, limit = 10, user: any) {
        const skip = (page - 1) * limit;
        const plans = await this.planRepo.find({
            skip: skip,
            take: limit,
            order: { createdAt: 'ASC' },
            relations: ['plan_limits']
        });
        await this.recordAction('PLAN_LIST', 'Plan list fetched', user.id, { page, limit, count: plans.length });
        return {
            data: plans,
            meta: {
                page: page,
                limit: limit,
            },
        };
    }

    async showPlan(id: string, user: any) {
        console.log('Fetching plan with id:', id);
        const plan = await this.planRepo.findOne({
            where: { id: id },
            relations: ['plan_limits']
        });
        if (!plan) {
            throw new NotFoundException('Plan not found');
        }
        await this.recordAction('PLAN_SHOW', 'Plan details fetched', user.id, { planId: id });
        return plan;
    }

    async createPlan(createPlanDto: CreatePlanDto, user: any) {
        const planExists = await this.planRepo.findOne({ where: { slug: createPlanDto.slug } });
        if (planExists) {
            throw new ConflictException('Plan already exists');
        }

        let plan: Plan;
        try {
            plan = await this.planRepo.manager.transaction(async (manager) => {
                const createdPlan = await manager.save(
                    Plan,
                    manager.create(Plan, {
                        title: createPlanDto.title,
                        slug: createPlanDto.slug,
                        stripe_price_id: createPlanDto.stripe_price_id || null,
                        payfast_price_id: createPlanDto.payfast_price_id || null,
                        description: createPlanDto.description,
                        currency: createPlanDto.currency,
                        price: createPlanDto.price,
                        billing_cycle: createPlanDto.billing_cycle,
                        is_active: createPlanDto.is_active,
                        is_display: createPlanDto.is_display,
                    }),
                );

                if (Array.isArray(createPlanDto.plan_limits)) {
                    const limits = createPlanDto.plan_limits.map((limit) =>
                        manager.create(PlanLimit, {
                            plan: createdPlan,
                            limitKey: limit.limitKey,
                            limitValue: limit.limitValue,
                        }),
                    );
                    await manager.save(PlanLimit, limits);
                } else if (createPlanDto.plan_limits) {
                    throw new BadRequestException('Limits should be an array');
                }

                return createdPlan;
            });
        } catch (error: any) {
            if (error?.code === '23505') {
                throw new ConflictException('Multiple limits per plan are blocked by DB unique constraint. Run latest migrations on server.');
            }
            throw new InternalServerErrorException(error?.detail ?? 'Failed to create plan');
        }

        await this.recordAction('PLAN_CREATE', 'Plan created', user.id, { planId: plan.id, slug: plan.slug });
        return plan;
    }

    async updatePlan(id: string, updatePlanDto: UpdatePlanDto, user: any) {
        // Find the existing plan along with its limits
        const plan = await this.planRepo.findOne({ where: { id: id }, relations: ['plan_limits'] });

        if (!plan) {
            throw new NotFoundException('Plan not found');
        }

        // Check if the slug is being changed and whether the new slug already exists (excluding current plan)
        if (updatePlanDto.slug && updatePlanDto.slug !== plan.slug) {
            const slugExists = await this.planRepo.findOne({
                where: { slug: updatePlanDto.slug, id: Not(id) }, // Exclude the current plan's ID
            });
            if (slugExists) {
                throw new ConflictException('Plan slug already exists');
            }
        }

        const { plan_limits, ...planFields } = updatePlanDto;

        // Save plan + replace limits atomically.
        await this.planRepo.manager.transaction(async (manager) => {
            Object.assign(plan, planFields);
            await manager.save(Plan, plan);

            // Replace limits by plan ID to avoid stale relation state issues.
            if (Array.isArray(plan_limits)) {
                await manager.delete(PlanLimit, { plan: { id: plan.id } });

                if (plan_limits.length) {
                    const limits = plan_limits.map((limit) =>
                        manager.create(PlanLimit, {
                            plan: { id: plan.id } as Plan,
                            limitKey: limit.limitKey,
                            limitValue: limit.limitValue,
                        }),
                    );
                    await manager.save(PlanLimit, limits);
                }
            }
        });

        plan.plan_limits = await this.planLimitRepo.find({
            where: { plan: { id: plan.id } },
        });

        await this.recordAction('PLAN_UPDATE', 'Plan updated', user.id, { planId: id });

        return plan;
    }

    async updatePlanStatus(id: string, is_active: boolean, user: any) {
        const plan = await this.planRepo.findOne({ where: { id: id } });
        if (!plan) {
            throw new NotFoundException('Plan not found');
        }
        plan.is_active = is_active;
        await this.planRepo.update({ id: id }, plan);
        await this.recordAction('PLAN_STATUS_UPDATE', 'Plan status updated', user.id, { planId: id, isActive: is_active });
        return plan;
    }
}