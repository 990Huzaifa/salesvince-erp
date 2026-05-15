import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AddonService } from "../services/addon.service";
import { CreateAddonDto } from "../dto/addon/create-addon.dto";
import { UpdateAddonDto } from "../dto/addon/update-addon.dto";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";

@Controller('platform/addon')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AddonController {
    constructor(
        private readonly addonService: AddonService,
    ) {}

    @Get('/')
    async getAddons(@Query('page') page: number = 1, @Query('limit') limit: number = 10, @Req() req: any) {
        return this.addonService.getAddons(page, limit, req.user);
    }
    @Get('/:id')
    async getAddonById(@Param('id') id: number, @Req() req: any) {
        return this.addonService.getAddonById(id, req.user);
    }

    @Post("/")
    async createAddon(@Body() data: CreateAddonDto, @Req() req: any) {
        // Implementation for creating an addon
        return this.addonService.createAddon(data, req.user);
    }

    @Put('/:id')
    async updateAddon(@Param('id') id: number, @Body() data: UpdateAddonDto, @Req() req: any) {
        // Implementation for updating an addon
        return this.addonService.updateAddon(id, data, req.user);
    }

    @Put('/:id/status')
    async updateAddonStatus(@Param('id') id: number, @Query('is_active') isActive: boolean, @Req() req: any) {
        // Implementation for updating addon status
        return this.addonService.updateAddonStatus(id, isActive, req.user);
    }
}