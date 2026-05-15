import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { PlanService } from "../services/plan.service";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RequirePermissions } from "src/auth/require-permission.decorator";

@Controller("platform/plan")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PlanController {
    constructor(private readonly planService: PlanService) {}
    
    @RequirePermissions('PLAN_LIST')
    @Get('/')
    async getPlans(@Query('page') page: number, @Query('limit') limit: number, @Req() req: any) {
        return this.planService.getPlans(page, limit, req.user);
    }

    @RequirePermissions('PLAN_VIEW')
    @Get('/:id')
    async showPlan(@Param('id') id: string, @Req() req: any) {
        return this.planService.showPlan(id, req.user);
    }

    @RequirePermissions('PLAN_CREATE')
    @Post('/')
    async createPlan(@Body() createPlanDto: any, @Req() req: any) {
        return this.planService.createPlan(createPlanDto, req.user);
    }

    @RequirePermissions('PLAN_UPDATE')
    @Put('/:id')
    async updatePlan(@Body() updatePlanDto: any, @Param('id') id: string, @Req() req: any) {
        return this.planService.updatePlan(id, updatePlanDto, req.user);
    }

    @RequirePermissions('PLAN_UPDATE')
    @Put('/:id/status')
    async updatePlanStatus(@Query('is_active') is_active: boolean, @Param('id') id: string, @Req() req: any) {
        return this.planService.updatePlanStatus(id, is_active, req.user);
    }
}