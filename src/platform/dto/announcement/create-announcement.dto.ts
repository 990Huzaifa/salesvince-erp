import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { AnnouncementPlan, AnnouncementTenant, DisplayMode, TargetScope, Type } from "src/master-db/entities/announcement.entity";

export class CreateAnnouncementDto {
    
    @IsString()
    title?: string;

    @IsString()
    message?: string;
    
    @IsBoolean()
    isActive?: boolean;
    
    @IsBoolean()
    isDismissable?: boolean;
    
    @IsInt()
    priority?: number;
    
    @IsEnum(DisplayMode)
    displayMode?: DisplayMode;
    
    @IsEnum(Type)
    type?: Type;
    
    @IsEnum(TargetScope)
    targetScope?: TargetScope;
    
    @IsString()
    startsAt?: string;
    
    @IsString()
    endsAt?: string;

    @IsOptional()
    @IsString({ each: true })
    announcement_plans?: AnnouncementPlan[];

    @IsOptional()
    @IsString({ each: true })
    announcement_tenants?: AnnouncementTenant[];
    
}