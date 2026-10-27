import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import {
  DocumentTemplateDocumentType,
  DocumentTemplateEngine,
  DocumentTemplateSourceType,
} from 'src/master-db/entities/document-template-item.entity';

export class CreateDocumentTemplateItemDto {
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsEnum(DocumentTemplateDocumentType)
  documentType: DocumentTemplateDocumentType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DocumentTemplateSourceType)
  sourceType?: DocumentTemplateSourceType;

  @IsOptional()
  @IsEnum(DocumentTemplateEngine)
  engine?: DocumentTemplateEngine;

  @ValidateIf(
    (o: CreateDocumentTemplateItemDto) =>
      (o.sourceType ?? DocumentTemplateSourceType.INLINE) ===
      DocumentTemplateSourceType.INLINE,
  )
  @IsString()
  @IsNotEmpty()
  content?: string;

  @ValidateIf(
    (o: CreateDocumentTemplateItemDto) =>
      o.sourceType === DocumentTemplateSourceType.FILE,
  )
  @IsString()
  @IsNotEmpty()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileMimeType?: string;

  @IsOptional()
  @IsObject()
  pageSettings?: Record<string, unknown>;

  @IsOptional()
  variables?: unknown[] | Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
