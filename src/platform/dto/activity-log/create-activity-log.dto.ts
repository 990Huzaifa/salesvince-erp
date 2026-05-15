import { IsEnum, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';

export class CreateActivityLogDto {
    @IsEnum(ActivityLogActorType)
    actorType: ActivityLogActorType;

    @IsOptional()
    @IsUUID()
    actorId?: string | null;

    @IsOptional()
    @IsUUID()
    tenantId?: string | null;

    @IsString()
    action: string;

    @IsOptional()
    @IsString()
    description?: string | null;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, any> | null;

    @IsOptional()
    @IsUUID()
    jobId?: string | null;
}
