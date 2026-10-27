import { IsUUID } from 'class-validator';

export class AssignTenantDocumentTemplateDto {
  @IsUUID()
  tenantId: string;

  @IsUUID()
  templateId: string;
}
