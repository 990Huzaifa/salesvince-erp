import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ModuleService } from "../services/module.service";
import { CreateModuleDto } from "../dto/module/create-module.dto";
import { UpdateModuleDto } from "../dto/module/update-module.dto";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { PermissionGuard } from "src/auth/permission.guard";
import { RequirePermissions } from "src/auth/require-permission.decorator";

@Controller("platform/module")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ModuleController {
    constructor(
        private readonly moduleService: ModuleService,
    ) {}

    @RequirePermissions('MODULE_MANAGE')
    @Get("/")
    async getModules(@Query("page") page: number = 1, @Query("limit") limit: number = 10, @Req() req: any) {
        return this.moduleService.getModules(page, limit, req.user);
    }
    
    @RequirePermissions('MODULE_MANAGE')
    @Get("/:id")
    async getModuleById(@Param("id") id: string, @Req() req: any) {
        return this.moduleService.getModuleById(id, req.user);
    }

    @RequirePermissions('MODULE_MANAGE')
    @Post("/")
    async createModule(@Body() data: CreateModuleDto, @Req() req: any) {
        return this.moduleService.createModule(data, req.user);
    }

    @RequirePermissions('MODULE_MANAGE')
    @Put("/:id")
    async updateModule(@Param("id") id: string, @Body() data: UpdateModuleDto, @Req() req: any) {
        return this.moduleService.updateModule(id, data, req.user);
    }

    @RequirePermissions('MODULE_MANAGE')
    @Put("/:id/status")
    async updateModuleStatus(@Param("id") id: string, @Query("is_active") isActive: boolean, @Req() req: any) {
        return this.moduleService.updateModuleStatus(id, isActive, req.user);
    }
}
