import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Headers,
    HttpCode,
    Logger,
    Post,
    Query,
    Req,
} from '@nestjs/common';
import { MetaWhatsappApiService } from '../services/meta-whatsapp-api.service';
import { WhatsappAccountService } from '../services/whatsapp-account.service';

@Controller('platform/webhooks/meta/whatsapp')
export class MetaWhatsappWebhookController {
    private readonly logger = new Logger(MetaWhatsappWebhookController.name);

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
    receive(
        @Req() req: { rawBody?: Buffer; body: any },
        @Body() body: any,
        @Headers('x-hub-signature-256') signature: string,
    ) {
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
        if (!this.metaApi.verifyWebhookSignature(rawBody, signature)) {
            throw new ForbiddenException('Invalid webhook signature');
        }

        // ACK Meta immediately; process payload in background.
        void this.whatsappAccountService.handleWebhookPayload(body).catch((error) => {
            this.logger.error(
                `Background Meta webhook processing failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        });

        return { success: true };
    }
}
