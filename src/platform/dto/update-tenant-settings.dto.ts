import { IsOptional, IsEnum, IsString } from 'class-validator';
import { Currency, BaseUom, BaseLocale } from 'src/master-db/entities/tenant-settings.entity';

export class UpdateTenantSettingsDto {
    @IsOptional()
    @IsString()
    timezone?: string;

    @IsOptional()
    @IsEnum(Currency)
    currency?: Currency;

    @IsOptional()
    @IsEnum(BaseUom)
    baseUom?: BaseUom;

    @IsOptional()
    @IsEnum(BaseLocale)
    baseLocale?: BaseLocale;
}
