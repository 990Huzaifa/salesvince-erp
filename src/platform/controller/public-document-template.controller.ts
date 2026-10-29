import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DocumentTemplateService } from '../services/document-template.service';

/**
 * Unauthenticated document-template pack fetch for tenant design integration.
 * Only ACTIVE packs (and active sub-templates) are returned.
 */
@Controller('public/document-templates')
export class PublicDocumentTemplateController {
  constructor(
    private readonly documentTemplateService: DocumentTemplateService,
  ) {}

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentTemplateService.getPublicById(id);
  }
}
