import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Headers,
    HttpCode,
    Post,
    Query,
    Req,
} from '@nestjs/common';
import { MetaWhatsappApiService } from '../services/meta-whatsapp-api.service';
import { WhatsappAccountService } from '../services/whatsapp-account.service';

@Controller('platform/webhooks/meta/whatsapp')
export class MetaWhatsappWebhookController {
    constructor(
        private readonly whatsappAccountService: WhatsappAccountService,
        private readonly metaApi: MetaWhatsappApiService,
    ) {}

    @Get()
    verify(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
    ) {
        const result = this.whatsappAccountService.verifyWebhook(mode, token, challenge);
        if (result === null) {
            throw new ForbiddenException('Webhook verification failed');
        }
        return result;
    }

    @Post()
    @HttpCode(200)
    async receive(
        @Req() req: { rawBody?: Buffer; body: any },
        @Body() body: any,
        @Headers('x-hub-signature-256') signature: string,
    ) {
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
        if (!this.metaApi.verifyWebhookSignature(rawBody, signature)) {
            throw new ForbiddenException('Invalid webhook signature');
        }

        await this.whatsappAccountService.handleWebhookPayload(body);
        return { success: true };
    }
}
