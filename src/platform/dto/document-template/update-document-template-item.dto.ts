import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateDocumentTemplateItemDto } from './create-document-template-item.dto';

export class UpdateDocumentTemplateItemDto extends PartialType(
  OmitType(CreateDocumentTemplateItemDto, ['templateId'] as const),
) {}
