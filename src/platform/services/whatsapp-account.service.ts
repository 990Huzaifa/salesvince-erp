import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { LIMIT_KEY } from 'src/master-db/entities/plan.entity';
import { Status, Subscription } from 'src/master-db/entities/subscription.entity';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import {
    TenantWhatsappAccounts,
    TenantWhatsappAccountStatus,
} from 'src/master-db/entities/tenant-whatsapp-accounts.entity';
import {
    TenantWhatsappAccountTemplates,
    TenantWhatsappTemplateStatus,
} from 'src/master-db/entities/tenant_whatsapp_account_templates.entity';
import { Repository } from 'typeorm';
import { CreateWhatsappAccountDto } from '../dto/whatsapp-account/create-whatsapp-account.dto';
import { UpdateWhatsappAccountDto } from '../dto/whatsapp-account/update-whatsapp-account.dto';
import { ActivityLogService } from './activity-log.service';
import { MetaWhatsappApiService } from './meta-whatsapp-api.service';

@Injectable()
export class WhatsappAccountService {
    private readonly logger = new Logger(WhatsappAccountService.name);

    constructor(
        @InjectRepository(TenantWhatsappAccounts)
        private readonly accountRepo: Repository<TenantWhatsappAccounts>,
        @InjectRepository(TenantWhatsappAccountTemplates)
        private readonly accountTemplateRepo: Repository<TenantWhatsappAccountTemplates>,
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        private readonly activityLogService: ActivityLogService,
        private readonly metaApi: MetaWhatsappApiService,
    ) {}

    private async recordAction(
        action: string,
        description: string,
        actorId: string,
        metadata?: Record<string, any>,
    ) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    private toSafeAccount(account: TenantWhatsappAccounts) {
        const { accessToken, ...rest } = account;
        return {
            ...rest,
            hasToken: Boolean(accessToken),
        };
    }

    planHasWhatsappLimit(plan: { plan_limits?: { limitKey: LIMIT_KEY }[] } | null | undefined): boolean {
        return Boolean(
            plan?.plan_limits?.some((limit) => limit.limitKey === LIMIT_KEY.WHATSAPP),
        );
    }

    async tenantHasWhatsappLimit(tenantId: string): Promise<boolean> {
        const subscription = await this.subscriptionRepo.findOne({
            where: { tenant: { id: tenantId }, status: Status.ACTIVE },
            relations: ['plan', 'plan.plan_limits'],
        });
        return this.planHasWhatsappLimit(subscription?.plan);
    }

    async ensureDefaultWhatsappAccount(
        tenantId: string,
        user: { id: string },
        phoneDto?: CreateWhatsappAccountDto,
    ): Promise<TenantWhatsappAccounts | null> {
        const hasLimit = await this.tenantHasWhatsappLimit(tenantId);
        if (!hasLimit) {
            return null;
        }

        const existing = await this.accountRepo.findOne({
            where: { tenantId, isDefault: true },
        });
        if (existing) {
            return existing;
        }

        const account = this.accountRepo.create({
            tenantId,
            createdById: user.id,
            displayPhoneNumber: phoneDto?.displayPhoneNumber ?? '',
            phoneCountryCode: phoneDto?.phoneCountryCode ?? '',
            phoneNationalNumber: phoneDto?.phoneNationalNumber ?? '',
            status: TenantWhatsappAccountStatus.NUMBER_SAVED,
            isDefault: true,
        });

        return this.accountRepo.save(account);
    }

    private async assertTenantExists(tenantId: string) {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new NotFoundException('Tenant not found');
        }
    }

    private async getAccountForTenant(tenantId: string, accountId: string) {
        const account = await this.accountRepo.findOne({
            where: { id: accountId, tenantId },
        });
        if (!account) {
            throw new NotFoundException('WhatsApp account not found');
        }
        return account;
    }

    async listAccounts(tenantId: string, page = 1, limit = 10, user: { id: string }) {
        await this.assertTenantExists(tenantId);
        const skip = (page - 1) * limit;
        const [accounts, total] = await this.accountRepo.findAndCount({
            where: { tenantId },
            skip,
            take: limit,
            order: { createdAt: 'DESC' },
        });

        await this.recordAction(
            'WHATSAPP_ACCOUNT_LIST',
            'WhatsApp account list fetched',
            user.id,
            { tenantId, page, limit, total },
        );

        return {
            data: accounts.map((a) => this.toSafeAccount(a)),
            meta: { total, page, limit },
        };
    }

    async getAccount(tenantId: string, accountId: string, user: { id: string }) {
        const account = await this.getAccountForTenant(tenantId, accountId);
        await this.recordAction(
            'WHATSAPP_ACCOUNT_SHOW',
            'WhatsApp account details fetched',
            user.id,
            { tenantId, accountId },
        );
        return this.toSafeAccount(account);
    }

    async createAccount(
        tenantId: string,
        dto: CreateWhatsappAccountDto,
        user: { id: string },
    ) {
        await this.assertTenantExists(tenantId);
        const hasLimit = await this.tenantHasWhatsappLimit(tenantId);
        if (!hasLimit) {
            throw new BadRequestException('Tenant plan does not include WhatsApp');
        }

        const existing = await this.accountRepo.findOne({
            where: { tenantId, isDefault: true },
        });
        if (existing) {
            throw new BadRequestException('Default WhatsApp account already exists for this tenant');
        }

        const account = await this.accountRepo.save(
            this.accountRepo.create({
                tenantId,
                createdById: user.id,
                displayPhoneNumber: dto.displayPhoneNumber ?? '',
                phoneCountryCode: dto.phoneCountryCode ?? '',
                phoneNationalNumber: dto.phoneNationalNumber ?? '',
                status: TenantWhatsappAccountStatus.NUMBER_SAVED,
                isDefault: true,
            }),
        );

        await this.recordAction(
            'WHATSAPP_ACCOUNT_CREATE',
            'WhatsApp account created',
            user.id,
            { tenantId, accountId: account.id },
        );

        return this.toSafeAccount(account);
    }

    async updateAccount(
        tenantId: string,
        accountId: string,
        dto: UpdateWhatsappAccountDto,
        user: { id: string },
    ) {
        const account = await this.getAccountForTenant(tenantId, accountId);
        if (account.status === TenantWhatsappAccountStatus.CONNECTED) {
            throw new BadRequestException('Cannot edit a connected WhatsApp account');
        }

        Object.assign(account, dto);
        const saved = await this.accountRepo.save(account);

        await this.recordAction(
            'WHATSAPP_ACCOUNT_UPDATE',
            'WhatsApp account updated',
            user.id,
            { tenantId, accountId },
        );

        return this.toSafeAccount(saved);
    }

    async connectStart(tenantId: string, accountId: string, user: { id: string }) {
        const hasLimit = await this.tenantHasWhatsappLimit(tenantId);
        if (!hasLimit) {
            throw new BadRequestException('Tenant plan does not include WhatsApp');
        }

        const account = await this.getAccountForTenant(tenantId, accountId);
        const allowed = [
            TenantWhatsappAccountStatus.NUMBER_SAVED,
            TenantWhatsappAccountStatus.FAILED,
        ];
        if (!allowed.includes(account.status)) {
            throw new BadRequestException(
                `Account cannot start connect from status ${account.status}`,
            );
        }

        if (!account.displayPhoneNumber && !account.phoneNationalNumber) {
            throw new BadRequestException('Phone number must be saved before connecting');
        }

        try {
            this.metaApi.assertConfigured();
        } catch {
            throw new BadRequestException('Meta integration is not configured');
        }

        account.status = TenantWhatsappAccountStatus.SETUP_STARTED;
        account.setupStartedAt = new Date();
        account.setupStartedById = user.id;
        account.failureReason = null;
        account.failedAt = null;
        await this.accountRepo.save(account);

        await this.recordAction(
            'WHATSAPP_ACCOUNT_CONNECT_START',
            'WhatsApp Meta connect started',
            user.id,
            { tenantId, accountId },
        );

        return {
            account: this.toSafeAccount(account),
            meta: this.metaApi.getConnectConfig(),
        };
    }

    async connectCallback(
        tenantId: string,
        accountId: string,
        code: string,
        user: { id: string },
        redirectUri?: string,
    ) {
        const account = await this.getAccountForTenant(tenantId, accountId);
        if (account.status !== TenantWhatsappAccountStatus.SETUP_STARTED) {
            throw new BadRequestException('Account is not in setup state');
        }

        try {
            const tokenResult = await this.metaApi.exchangeCodeForToken(code, redirectUri);
            const assets = await this.metaApi.fetchConnectAssets(tokenResult.accessToken);

            account.wabaId = assets.wabaId;
            account.phoneNumberId = assets.phoneNumberId;
            account.businessAccountId = assets.businessAccountId;
            account.accessToken = assets.accessToken;
            account.tokenExpiresAt = assets.tokenExpiresAt;
            if (assets.displayPhoneNumber) {
                account.displayPhoneNumber = assets.displayPhoneNumber;
            }
            account.status = TenantWhatsappAccountStatus.CONNECTED;
            account.connectedAt = new Date();
            account.connectedById = user.id;
            account.failureReason = null;
            account.failedAt = null;

            const saved = await this.accountRepo.save(account);

            await this.recordAction(
                'WHATSAPP_ACCOUNT_CONNECT_SUCCESS',
                'WhatsApp Meta connect completed',
                user.id,
                { tenantId, accountId, wabaId: assets.wabaId },
            );

            return this.toSafeAccount(saved);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            account.status = TenantWhatsappAccountStatus.FAILED;
            account.failedAt = new Date();
            account.failureReason = message;
            await this.accountRepo.save(account);

            await this.recordAction(
                'WHATSAPP_ACCOUNT_CONNECT_FAILED',
                'WhatsApp Meta connect failed',
                user.id,
                { tenantId, accountId, error: message },
            );

            throw new BadRequestException(`Meta connect failed: ${message}`);
        }
    }

    async getLiveStatus(tenantId: string, accountId: string, user: { id: string }) {
        const account = await this.getAccountForTenant(tenantId, accountId);
        const safe = this.toSafeAccount(account);

        let live: { reachable: boolean; data?: unknown; error?: string } | null = null;
        if (
            account.status === TenantWhatsappAccountStatus.CONNECTED &&
            account.phoneNumberId &&
            account.accessToken
        ) {
            live = await this.metaApi.getPhoneNumberStatus(
                account.phoneNumberId,
                account.accessToken,
            );
        }

        await this.recordAction(
            'WHATSAPP_ACCOUNT_STATUS',
            'WhatsApp account status fetched',
            user.id,
            { tenantId, accountId },
        );

        return { account: safe, live };
    }

    async disableAccount(tenantId: string, accountId: string, user: { id: string }) {
        const account = await this.getAccountForTenant(tenantId, accountId);
        account.status = TenantWhatsappAccountStatus.DISABLED;
        account.disabledAt = new Date();
        account.disabledById = user.id;
        const saved = await this.accountRepo.save(account);

        await this.recordAction(
            'WHATSAPP_ACCOUNT_DISABLE',
            'WhatsApp account disabled',
            user.id,
            { tenantId, accountId },
        );

        return this.toSafeAccount(saved);
    }

    verifyWebhook(mode: string, token: string, challenge: string): string | null {
        if (mode === 'subscribe' && token === this.metaApi.webhookVerifyToken) {
            return challenge;
        }
        return null;
    }

    async handleWebhookPayload(body: any) {
        if (!body?.entry) {
            return;
        }

        for (const entry of body.entry) {
            for (const change of entry.changes ?? []) {
                const field = change.field;
                const value = change.value;

                if (field === 'message_template_status_update') {
                    await this.handleTemplateStatusUpdate(value);
                } else if (field === 'account_update') {
                    await this.handleAccountUpdate(value);
                } else {
                    this.logger.debug(`Unhandled Meta webhook field: ${field}`);
                }
            }
        }
    }

    private async handleTemplateStatusUpdate(value: any) {
        const metaTemplateId = value?.message_template_id?.toString();
        const metaTemplateName = value?.message_template_name;
        const event = value?.event;

        if (!metaTemplateId && !metaTemplateName) {
            return;
        }

        const where = metaTemplateId
            ? { metaTemplateId }
            : { metaTemplateName };

        const row = await this.accountTemplateRepo.findOne({ where });
        if (!row) {
            return;
        }

        const statusMap: Record<string, TenantWhatsappTemplateStatus> = {
            APPROVED: TenantWhatsappTemplateStatus.APPROVED,
            REJECTED: TenantWhatsappTemplateStatus.REJECTED,
            PENDING: TenantWhatsappTemplateStatus.PENDING,
            PAUSED: TenantWhatsappTemplateStatus.PAUSED,
            DISABLED: TenantWhatsappTemplateStatus.DISABLED,
        };

        if (event && statusMap[event]) {
            row.status = statusMap[event];
        }
        row.metaResponse = value;
        row.rejectionReason = value?.reason ?? row.rejectionReason;
        row.lastSyncedAt = new Date();

        if (row.status === TenantWhatsappTemplateStatus.APPROVED) {
            row.approvedAt = new Date();
        }
        if (row.status === TenantWhatsappTemplateStatus.REJECTED) {
            row.rejectedAt = new Date();
        }

        await this.accountTemplateRepo.save(row);
    }

    private async handleAccountUpdate(value: any) {
        const phoneNumberId = value?.phone_number_id?.toString();
        if (!phoneNumberId) {
            return;
        }

        const account = await this.accountRepo.findOne({
            where: { phoneNumberId },
        });
        if (!account) {
            return;
        }

        const event = value?.event;
        if (event === 'DISABLED' || event === 'FLAGGED') {
            account.failureReason = value?.ban_info?.reason ?? event;
            if (account.status === TenantWhatsappAccountStatus.CONNECTED) {
                account.status = TenantWhatsappAccountStatus.FAILED;
                account.failedAt = new Date();
            }
            await this.accountRepo.save(account);
        }
    }
}
