import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Module } from "src/master-db/entities/module.entity";
import { Repository } from "typeorm";
import { CreateModuleDto } from "../dto/module/create-module.dto";
import { UpdateModuleDto } from "../dto/module/update-module.dto";
import { ActivityLogService } from "./activity-log.service";
import { ActivityLogActorType } from "src/master-db/entities/activity-log.entity";

@Injectable()
export class ModuleService {
    constructor(
        @InjectRepository(Module)
        private readonly moduleRepository: Repository<Module>,
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

    async getModules(page: number, limit: number, user: any) {
        const skip = (page - 1) * limit;
        const [modules, total] = await this.moduleRepository.findAndCount({
            skip,
            take: limit,
        });
        await this.recordAction('MODULE_LIST', 'Module list fetched', user.id, { page, limit, total });
        return {
            data: modules,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getModuleById(id: string, user: any) {
        const module = await this.moduleRepository.findOne({ where: { id } });
        if (!module) {
            throw new NotFoundException("Module not found");
        }
        await this.recordAction('MODULE_SHOW', 'Module details fetched', user.id, { moduleId: id });
        return module;
    }

    async createModule(data: CreateModuleDto, user: any) {
        const module = this.moduleRepository.create(data);
        const savedModule = await this.moduleRepository.save(module);
        await this.recordAction('MODULE_CREATE', 'Module created', user.id, { moduleId: savedModule.id });
        return savedModule;
    }

    async updateModule(id: string, data: UpdateModuleDto, user: any) {
        const module = await this.moduleRepository.findOne({ where: { id } });
        if (!module) {
            throw new NotFoundException("Module not found");
        }
        Object.assign(module, data);
        const savedModule = await this.moduleRepository.save(module);
        await this.recordAction('MODULE_UPDATE', 'Module updated', user.id, { moduleId: id });
        return savedModule;
    }

    async updateModuleStatus(id: string, isActive: boolean, user: any) {
        const module = await this.moduleRepository.findOne({ where: { id } });
        if (!module) {
            throw new NotFoundException("Module not found");
        }
        module.isActive = isActive;
        const savedModule = await this.moduleRepository.save(module);
        await this.recordAction('MODULE_STATUS_UPDATE', 'Module status updated', user.id, { moduleId: id, isActive });
        return savedModule;
    }
}
