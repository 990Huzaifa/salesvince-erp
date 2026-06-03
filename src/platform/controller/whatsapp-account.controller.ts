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
import { ConnectCallbackDto } from '../dto/whatsapp-account/connect-callback.dto';
import { CreateWhatsappAccountDto } from '../dto/whatsapp-account/create-whatsapp-account.dto';
import { UpdateWhatsappAccountDto } from '../dto/whatsapp-account/update-whatsapp-account.dto';
import { WhatsappAccountService } from '../services/whatsapp-account.service';

@Controller('platform/tenant/:tenantId/whatsapp-account')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WhatsappAccountController {
    constructor(private readonly whatsappAccountService: WhatsappAccountService) {}

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Get('/')
    async listAccounts(
        @Param('tenantId') tenantId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.listAccounts(tenantId, page, limit, req.user);
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Get('/:accountId')
    async getAccount(
        @Param('tenantId') tenantId: string,
        @Param('accountId') accountId: string,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.getAccount(tenantId, accountId, req.user);
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Post('/')
    async createAccount(
        @Param('tenantId') tenantId: string,
        @Body() dto: CreateWhatsappAccountDto,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.createAccount(tenantId, dto, req.user);
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Put('/:accountId')
    async updateAccount(
        @Param('tenantId') tenantId: string,
        @Param('accountId') accountId: string,
        @Body() dto: UpdateWhatsappAccountDto,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.updateAccount(tenantId, accountId, dto, req.user);
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Post('/:accountId/connect/start')
    async connectStart(
        @Param('tenantId') tenantId: string,
        @Param('accountId') accountId: string,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.connectStart(tenantId, accountId, req.user);
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Post('/:accountId/connect/callback')
    async connectCallback(
        @Param('tenantId') tenantId: string,
        @Param('accountId') accountId: string,
        @Body() dto: ConnectCallbackDto,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.connectCallback(
            tenantId,
            accountId,
            dto.code,
            req.user,
            dto.redirectUri,
        );
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Get('/:accountId/status')
    async getStatus(
        @Param('tenantId') tenantId: string,
        @Param('accountId') accountId: string,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.getLiveStatus(tenantId, accountId, req.user);
    }

    @RequirePermissions('WHATSAPP_ACCOUNT_MANAGE')
    @Put('/:accountId/disable')
    async disableAccount(
        @Param('tenantId') tenantId: string,
        @Param('accountId') accountId: string,
        @Req() req: any,
    ) {
        return this.whatsappAccountService.disableAccount(tenantId, accountId, req.user);
    }
}
