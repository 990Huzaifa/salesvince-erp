import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    WhatsappTemplateCategory,
    WhatsappTemplateHeaderType,
    WhatsappTemplateModuleType,
    WhatsappTemplateStatus,
} from 'src/master-db/entities/whatsapp-template.entity';

export class CreateWhatsappTemplateDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsNotEmpty()
    metaTemplateName: string;

    @IsEnum(WhatsappTemplateModuleType)
    moduleType: WhatsappTemplateModuleType;

    @IsOptional()
    @IsString()
    eventType?: string;

    @IsOptional()
    @IsEnum(WhatsappTemplateCategory)
    category?: WhatsappTemplateCategory;

    @IsOptional()
    @IsString()
    languageCode?: string;

    @IsOptional()
    @IsEnum(WhatsappTemplateHeaderType)
    headerType?: WhatsappTemplateHeaderType;

    @IsOptional()
    @IsString()
    headerText?: string;

    @IsString()
    @IsNotEmpty()
    bodyText: string;

    @IsOptional()
    @IsString()
    footerText?: string;

    @IsOptional()
    @IsArray()
    buttons?: any[];

    @IsOptional()
    @IsArray()
    variables?: any[];

    @IsOptional()
    sampleValues?: any;

    @IsOptional()
    @IsBoolean()
    attachPdf?: boolean;

    @IsOptional()
    @IsEnum(WhatsappTemplateStatus)
    status?: WhatsappTemplateStatus;
}
