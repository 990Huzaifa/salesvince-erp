import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { SubscriptionService } from "../services/subscription.service";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { CurrentPlatformUser } from "src/auth/current-platform-user.decorator";
import { UpdateSubscriptionDto } from "../dto/subscription/update-subscription.dto";

@Controller('platform/subscription')
@UseGuards(JwtAuthGuard, PermissionGuard)   
export class SubscriptionController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
    ) {}

    @Get('/')
    async getSubscriptions(@Query('page') page: number = 1, @Query('limit') limit: number = 10, @CurrentPlatformUser() user: any) {
        return this.subscriptionService.getSubscriptions(page, limit, user.id);
    }

    @Get('/:id')
    async getSubscriptionById(@Param('id') id: number, @CurrentPlatformUser() user: any) {
        return this.subscriptionService.getSubscriptionById(id, user.id);
    }

    @Put('/:id/status')
    async updateSubscription(@Param('id') id: number, @Body() dto: UpdateSubscriptionDto, @Req() req: any) {
        return this.subscriptionService.updateSubscription(id, dto, req.user);
    }

    // for addons and plan

    @Post('/:id/addons')
    async addAddonToSubscription(@Param('id') id: number, @Body() dto: any, @Req() req: any) {
        console.log(id, dto, req.user);
        return this.subscriptionService.addAddonToSubscription(id, dto, req.user);
    }

    @Delete('/:id/addons/:addonId')
    async removeAddonFromSubscription(@Param('id') id: number, @Param('addonId') addonId: number, @Req() req: any) {
        return this.subscriptionService.removeAddonFromSubscription(id, addonId, req.user);
    }

    @Put('/:id/plan')
    async updateSubscriptionPlan(@Param('id') id: number, @Query('planId') planId: any, @Req() req: any) {
        return this.subscriptionService.updateSubscriptionPlan(id, planId, req.user);
    }
}