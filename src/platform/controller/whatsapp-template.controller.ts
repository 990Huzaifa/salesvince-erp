import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { CreateWhatsappTemplateDto } from '../dto/whatsapp-template/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from '../dto/whatsapp-template/update-whatsapp-template.dto';
import { UpdateWhatsappTemplateStatusDto } from '../dto/whatsapp-template/update-whatsapp-template-status.dto';
import { WhatsappTemplateService } from '../services/whatsapp-template.service';

@Controller('platform/whatsapp-template')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WhatsappTemplateController {
    constructor(
        private readonly whatsappTemplateService: WhatsappTemplateService,
    ) {}

    @RequirePermissions('WHATSAPP_TEMPLATE_MANAGE')
    @Get('/')
    async getTemplates(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Req() req: any,
    ) {
        return this.whatsappTemplateService.getTemplates(page, limit, req.user);
    }

    @RequirePermissions('WHATSAPP_TEMPLATE_MANAGE')
    @Get('/:id')
    async getTemplateById(@Param('id') id: string, @Req() req: any) {
        return this.whatsappTemplateService.getTemplateById(id, req.user);
    }

    @RequirePermissions('WHATSAPP_TEMPLATE_MANAGE')
    @Post('/')
    async createTemplate(@Body() data: CreateWhatsappTemplateDto, @Req() req: any) {
        return this.whatsappTemplateService.createTemplate(data, req.user);
    }

    @RequirePermissions('WHATSAPP_TEMPLATE_MANAGE')
    @Put('/:id')
    async updateTemplate(
        @Param('id') id: string,
        @Body() data: UpdateWhatsappTemplateDto,
        @Req() req: any,
    ) {
        return this.whatsappTemplateService.updateTemplate(id, data, req.user);
    }

    @RequirePermissions('WHATSAPP_TEMPLATE_MANAGE')
    @Put('/:id/status')
    async updateTemplateStatus(
        @Param('id') id: string,
        @Body() data: UpdateWhatsappTemplateStatusDto,
        @Req() req: any,
    ) {
        return this.whatsappTemplateService.updateTemplateStatus(id, data, req.user);
    }
}
