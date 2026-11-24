import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDocumentTemplateDto } from './create-document-template.dto';

export class UpdateDocumentTemplateDto extends PartialType(
  OmitType(CreateDocumentTemplateDto, ['includeDefaultLayouts'] as const),
) {}
