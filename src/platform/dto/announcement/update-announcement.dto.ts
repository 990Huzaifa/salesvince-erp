import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { AnnouncementPlan, AnnouncementTenant, DisplayMode, TargetScope, Type } from "src/master-db/entities/announcement.entity";

export class UpdateAnnouncementDto {

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    message?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsBoolean()
    isDismissable?: boolean;

    @IsOptional()
    @IsInt()
    priority?: number;

    @IsOptional()
    @IsEnum(DisplayMode)
    displayMode?: DisplayMode;

    @IsOptional()
    @IsEnum(Type)
    type?: Type;

    @IsOptional()
    @IsEnum(TargetScope)
    targetScope?: TargetScope;

    @IsOptional()
    @IsString()
    startsAt?: string;

    @IsOptional()
    @IsString()
    endsAt?: string;

    @IsOptional()
    @IsString({ each: true })
    announcement_plans?: AnnouncementPlan[];

    @IsOptional()
    @IsString({ each: true })
    announcement_tenants?: AnnouncementTenant[];

    
}