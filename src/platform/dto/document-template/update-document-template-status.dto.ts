import { IsEnum } from 'class-validator';
import { DocumentTemplateStatus } from 'src/master-db/entities/document-template.entity';

export class UpdateDocumentTemplateStatusDto {
  @IsEnum(DocumentTemplateStatus)
  status: DocumentTemplateStatus;
}
