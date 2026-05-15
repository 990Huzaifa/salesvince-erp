import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Addon } from "src/master-db/entities/addon.entity";
import { Repository } from "typeorm";
import { CreateAddonDto } from "../dto/addon/create-addon.dto";
import { UpdateAddonDto } from "../dto/addon/update-addon.dto";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class AddonService {
    constructor(
        @InjectRepository(Addon)
        private readonly addonRepository: Repository<Addon>,
        private readonly activityLogService: ActivityLogService,
    ) {}

    private async recordAction(action: string, description: string, actorId:string, metadata?: Record<string, any>) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getAddons(page: number, limit: number, user: any) {
        const skip = (page - 1) * limit;
        const [addons, total] = await this.addonRepository.findAndCount({
            skip,
            take: limit,
        });
        await this.recordAction('ADDON_LIST', 'Addon list fetched', user.id, { page, limit, total });
        return {
            data: addons,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getAddonById(id: number, user: any = null) {
        const addon = await this.addonRepository.findOne({ where: { id } });
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        await this.recordAction('ADDON_SHOW', 'Addon details fetched', user.id, { addonId: id });
        return addon;
    }

    async createAddon(data: CreateAddonDto, user: any) {
        const addon = this.addonRepository.create(data);
        const savedAddon = await this.addonRepository.save(addon);
        await this.recordAction('ADDON_CREATE', 'Addon created', user.id, { addonId: savedAddon.id });
        return savedAddon;
    }

    async updateAddon(id: number, data: UpdateAddonDto, user: any) {
        const addon = await this.addonRepository.findOne({ where: { id } });
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        Object.assign(addon, data);
        const savedAddon = await this.addonRepository.save(addon);
        await this.recordAction('ADDON_UPDATE', 'Addon updated', user.id, { addonId: id });
        return savedAddon;
    }

    async updateAddonStatus(id: number, isActive: boolean, user: any) {
        const addon = await this.addonRepository.findOne({ where: { id } });
        if (!addon) {
            throw new NotFoundException('Addon not found');
        }
        addon.is_active = isActive;
        const savedAddon = await this.addonRepository.save(addon);
        await this.recordAction('ADDON_STATUS_UPDATE', 'Addon status updated', user.id, { addonId: id, isActive });
        return savedAddon;
    }
}