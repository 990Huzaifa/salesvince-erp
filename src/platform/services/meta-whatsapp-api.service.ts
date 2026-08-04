import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { firstValueFrom } from 'rxjs';

export interface MetaTokenExchangeResult {
    accessToken: string;
    tokenType?: string;
    expiresIn?: number;
}

export interface MetaPhoneNumberDetails {
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    code_verification_status?: string;
}

export interface MetaConnectAssets {
    businessAccountId: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber?: string;
    accessToken: string;
    tokenExpiresAt: Date | null;
}

export interface MetaCreateMessageTemplatePayload {
    name: string;
    language: string;
    category: string;
    components: Record<string, unknown>[];
    allow_category_change?: boolean;
}

export interface MetaCreateMessageTemplateResult {
    id: string;
    status: string;
    category?: string;
}

export interface MetaMessageTemplateListItem {
    id: string;
    name: string;
    status: string;
    language: string;
    category?: string;
}

@Injectable()
export class MetaWhatsappApiService {
    private readonly logger = new Logger(MetaWhatsappApiService.name);

    constructor(private readonly httpService: HttpService) {}

    get appId(): string {
        return process.env.META_APP_ID ?? '';
    }

    get appSecret(): string {
        return process.env.META_APP_SECRET ?? '';
    }

    get embeddedSignupConfigId(): string {
        return process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? '';
    }

    get apiVersion(): string {
        return process.env.META_API_VERSION ?? 'v21.0';
    }

    get webhookVerifyToken(): string {
        return process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
    }

    /** Shared WABA used for platform-level template sync. */
    get wabaId(): string {
        return process.env.META_WABA_ID ?? '';
    }

    /** System-user / permanent token for shared WABA Graph calls. */
    get accessToken(): string {
        return process.env.META_ACCESS_TOKEN ?? '';
    }

    getConnectConfig() {
        return {
            appId: this.appId,
            configId: this.embeddedSignupConfigId,
            apiVersion: this.apiVersion,
        };
    }

    assertConfigured() {
        if (!this.appId || !this.appSecret) {
            throw new Error('META_APP_ID and META_APP_SECRET must be configured');
        }
    }

    assertWabaConfigured() {
        if (!this.wabaId || !this.accessToken) {
            throw new Error('META_WABA_ID and META_ACCESS_TOKEN must be configured');
        }
    }

    private graphUrl(path: string): string {
        return `https://graph.facebook.com/${this.apiVersion}/${path}`;
    }

    private extractGraphError(error: unknown): string {
        const axiosError = error as {
            response?: { data?: { error?: { message?: string; error_user_msg?: string } } };
            message?: string;
        };
        return (
            axiosError?.response?.data?.error?.error_user_msg ||
            axiosError?.response?.data?.error?.message ||
            axiosError?.message ||
            String(error)
        );
    }

    async exchangeCodeForToken(code: string, redirectUri?: string): Promise<MetaTokenExchangeResult> {
        this.assertConfigured();
        const params: Record<string, string> = {
            client_id: this.appId,
            client_secret: this.appSecret,
            code,
        };
        if (redirectUri) {
            params.redirect_uri = redirectUri;
        }

        const { data } = await firstValueFrom(
            this.httpService.get(this.graphUrl('oauth/access_token'), { params }),
        );

        return {
            accessToken: data.access_token,
            tokenType: data.token_type,
            expiresIn: data.expires_in,
        };
    }

    async fetchConnectAssets(accessToken: string): Promise<MetaConnectAssets> {
        const businesses = await this.graphGet<{ data: { id: string }[] }>(
            'me/businesses',
            accessToken,
            { fields: 'id' },
        );

        const business = businesses.data?.[0];
        if (!business?.id) {
            throw new Error('No Meta business account found for this token');
        }

        const wabaResponse = await this.graphGet<{ data: { id: string }[] }>(
            `${business.id}/client_whatsapp_business_accounts`,
            accessToken,
            { fields: 'id' },
        );

        const waba = wabaResponse.data?.[0];
        if (!waba?.id) {
            throw new Error('No WhatsApp Business Account found for this business');
        }

        const phones = await this.graphGet<{ data: MetaPhoneNumberDetails[] }>(
            `${waba.id}/phone_numbers`,
            accessToken,
            { fields: 'id,display_phone_number,verified_name' },
        );

        const phone = phones.data?.[0];
        if (!phone?.id) {
            throw new Error('No phone number found on the WhatsApp Business Account');
        }

        return {
            businessAccountId: business.id,
            wabaId: waba.id,
            phoneNumberId: phone.id,
            displayPhoneNumber: phone.display_phone_number,
            accessToken,
            tokenExpiresAt: null,
        };
    }

    async getPhoneNumberStatus(
        phoneNumberId: string,
        accessToken: string,
    ): Promise<{ reachable: boolean; data?: MetaPhoneNumberDetails; error?: string }> {
        try {
            const data = await this.graphGet<MetaPhoneNumberDetails>(
                phoneNumberId,
                accessToken,
                {
                    fields:
                        'verified_name,display_phone_number,quality_rating,code_verification_status',
                },
            );
            return { reachable: true, data };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Meta live status check failed for ${phoneNumberId}: ${message}`);
            return { reachable: false, error: message };
        }
    }

    verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
        if (!signatureHeader || !this.appSecret) {
            return false;
        }
        const expected = createHmac('sha256', this.appSecret)
            .update(rawBody)
            .digest('hex');
        const received = signatureHeader.replace(/^sha256=/, '');
        try {
            return timingSafeEqual(
                Buffer.from(expected, 'hex'),
                Buffer.from(received, 'hex'),
            );
        } catch {
            return false;
        }
    }

    async createMessageTemplate(
        payload: MetaCreateMessageTemplatePayload,
        wabaId = this.wabaId,
        accessToken = this.accessToken,
    ): Promise<MetaCreateMessageTemplateResult> {
        this.assertWabaConfigured();
        try {
            return await this.graphPost<MetaCreateMessageTemplateResult>(
                `${wabaId}/message_templates`,
                accessToken,
                payload,
            );
        } catch (error) {
            throw new Error(this.extractGraphError(error));
        }
    }

    async findMessageTemplateByName(
        name: string,
        language?: string,
        wabaId = this.wabaId,
        accessToken = this.accessToken,
    ): Promise<MetaMessageTemplateListItem | null> {
        this.assertWabaConfigured();
        try {
            const response = await this.graphGet<{ data?: MetaMessageTemplateListItem[] }>(
                `${wabaId}/message_templates`,
                accessToken,
                {
                    fields: 'id,name,status,language,category',
                    name,
                    limit: '100',
                },
            );

            const templates = response.data ?? [];
            if (language) {
                return (
                    templates.find(
                        (item) =>
                            item.name === name &&
                            item.language?.toLowerCase() === language.toLowerCase(),
                    ) ?? null
                );
            }
            return templates.find((item) => item.name === name) ?? null;
        } catch (error) {
            throw new Error(this.extractGraphError(error));
        }
    }

    private async graphGet<T>(
        path: string,
        accessToken: string,
        params?: Record<string, string>,
    ): Promise<T> {
        const { data } = await firstValueFrom(
            this.httpService.get<T>(this.graphUrl(path), {
                params: { ...params, access_token: accessToken },
            }),
        );
        return data;
    }

    private async graphPost<T>(
        path: string,
        accessToken: string,
        body: object,
    ): Promise<T> {
        const { data } = await firstValueFrom(
            this.httpService.post<T>(this.graphUrl(path), body, {
                params: { access_token: accessToken },
            }),
        );
        return data;
    }
}
