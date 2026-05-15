import { IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator';
import { Currency, BaseUom, BaseLocale } from 'src/master-db/entities/tenant-settings.entity';

export class UpdateTenantThemeDto {
    @IsOptional()
    @IsString()
    primaryColor?: string

    @IsOptional()
    @IsString()
    secondaryColor?: string

    @IsOptional()
    @IsString()
    accentColor?: string

    @IsOptional()
    @IsBoolean()
    darkMode?: boolean
}