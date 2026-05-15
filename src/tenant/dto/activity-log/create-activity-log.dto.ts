import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateActivityLogDto {
    @IsOptional()
    @IsUUID()
    actorId?: string | null;

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
