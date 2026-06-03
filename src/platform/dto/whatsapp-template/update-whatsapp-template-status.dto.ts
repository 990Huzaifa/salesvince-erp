import { IsEnum } from 'class-validator';
import { WhatsappTemplateStatus } from 'src/master-db/entities/whatsapp-template.entity';

export class UpdateWhatsappTemplateStatusDto {
    @IsEnum(WhatsappTemplateStatus)
    status: WhatsappTemplateStatus;
}
