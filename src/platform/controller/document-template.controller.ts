import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { DocumentTemplateStatus } from 'src/master-db/entities/document-template.entity';
import { DocumentTemplateDocumentType } from 'src/master-db/entities/document-template-item.entity';
import { CreateDocumentTemplateDto } from '../dto/document-template/create-document-template.dto';
import { CreateDocumentTemplateItemDto } from '../dto/document-template/create-document-template-item.dto';
import { UpdateDocumentTemplateDto } from '../dto/document-template/update-document-template.dto';
import { UpdateDocumentTemplateItemDto } from '../dto/document-template/update-document-template-item.dto';
import { SetDocumentTemplateItemActiveDto } from '../dto/document-template/set-document-template-item-active.dto';
import { UpdateDocumentTemplateStatusDto } from '../dto/document-template/update-document-template-status.dto';
import { DocumentTemplateItemService } from '../services/document-template-item.service';
import { DocumentTemplateService } from '../services/document-template.service';

@Controller('platform/document-templates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DocumentTemplateController {
  constructor(
    private readonly documentTemplateService: DocumentTemplateService,
    private readonly documentTemplateItemService: DocumentTemplateItemService,
  ) {}

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/')
  list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status: DocumentTemplateStatus | undefined,
    @Req() req: any,
  ) {
    return this.documentTemplateService.list(page, limit, req.user, status);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/default')
  getDefault(@Req() req: any) {
    return this.documentTemplateService.getDefault(req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/:id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.documentTemplateService.getById(id, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Post('/')
  create(@Body() data: CreateDocumentTemplateDto, @Req() req: any) {
    return this.documentTemplateService.create(data, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Put('/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateDocumentTemplateDto,
    @Req() req: any,
  ) {
    return this.documentTemplateService.update(id, data, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Put('/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateDocumentTemplateStatusDto,
    @Req() req: any,
  ) {
    return this.documentTemplateService.updateStatus(id, data, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Post('/:id/set-default')
  setDefault(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.documentTemplateService.setDefault(id, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Delete('/:id')
  delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.documentTemplateService.delete(id, req.user);
  }

  // ── items (sub-templates) ──────────────────────────────────────────

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/:templateId/items')
  listItems(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Query('documentType') documentType: DocumentTemplateDocumentType | undefined,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.listByTemplate(
      templateId,
      req.user,
      documentType,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/:templateId/items/by-type/:documentType')
  getItemByType(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('documentType') documentType: DocumentTemplateDocumentType,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.getByTemplateAndType(
      templateId,
      documentType,
      req.user,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/:templateId/items/:itemId')
  getItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.getById(itemId, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Post('/:templateId/items')
  createItem(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() data: CreateDocumentTemplateItemDto,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.create(templateId, data, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Put('/:templateId/items/upsert')
  upsertItem(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() data: CreateDocumentTemplateItemDto,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.upsertByType(
      templateId,
      data,
      req.user,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Put('/:templateId/items/:itemId')
  updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() data: UpdateDocumentTemplateItemDto,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.update(itemId, data, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Put('/:templateId/items/:itemId/active')
  setItemActive(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() data: SetDocumentTemplateItemActiveDto,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.setActive(
      itemId,
      data.isActive,
      req.user,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Delete('/:templateId/items/:itemId')
  deleteItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: any,
  ) {
    return this.documentTemplateItemService.delete(itemId, req.user);
  }
}
