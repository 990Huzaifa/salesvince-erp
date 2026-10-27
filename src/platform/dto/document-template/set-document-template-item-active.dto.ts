import { IsBoolean } from 'class-validator';

export class SetDocumentTemplateItemActiveDto {
  @IsBoolean()
  isActive: boolean;
}
