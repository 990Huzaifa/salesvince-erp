import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { DocumentTemplateDocumentType } from 'src/master-db/entities/document-template-item.entity';
import { AssignTenantDocumentTemplateDto } from '../dto/document-template/assign-tenant-document-template.dto';
import { TenantDocumentTemplateService } from '../services/tenant-document-template.service';

@Controller('platform/tenant-document-templates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TenantDocumentTemplateController {
  constructor(
    private readonly tenantDocumentTemplateService: TenantDocumentTemplateService,
  ) {}

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/')
  list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('templateId') templateId: string | undefined,
    @Req() req: any,
  ) {
    return this.tenantDocumentTemplateService.list(
      page,
      limit,
      req.user,
      templateId,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/by-tenant/:tenantId')
  getByTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: any,
  ) {
    return this.tenantDocumentTemplateService.getByTenant(tenantId, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/by-tenant/:tenantId/resolve')
  resolveTemplate(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    return this.tenantDocumentTemplateService.resolveTemplateForTenant(
      tenantId,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Get('/by-tenant/:tenantId/resolve/:documentType')
  resolveItem(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('documentType') documentType: DocumentTemplateDocumentType,
  ) {
    return this.tenantDocumentTemplateService.resolveItemForTenant(
      tenantId,
      documentType,
    );
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Post('/assign')
  assign(@Body() data: AssignTenantDocumentTemplateDto, @Req() req: any) {
    return this.tenantDocumentTemplateService.assign(data, req.user);
  }

  @RequirePermissions('DOCUMENT_TEMPLATE_MANAGE')
  @Delete('/by-tenant/:tenantId')
  unassign(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: any,
  ) {
    return this.tenantDocumentTemplateService.unassign(tenantId, req.user);
  }
}
