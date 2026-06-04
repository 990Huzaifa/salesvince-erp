import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant, TenantStatus } from '../master-db/entities/tenant.entity';
import { Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantProvisioningJob } from 'src/master-db/entities/tenant-provisioning-job.entity';
import { TenantProvisioningLog } from 'src/master-db/entities/tenant-provisioning-log.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantProfile } from 'src/master-db/entities/tenant-profile.entity';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { UpdateTenantThemeDto } from './dto/update-tenant-theme.dto';
import { UpdateTenantGeoPolicyDto } from './dto/update-tenant-geo-policy.dto';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { ProvisioningAdminService } from './services/provisioning-admin.service';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDatabaseService } from 'src/tenant-db/services/tenant-database.service';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';
import { PlatformRole } from 'src/master-db/entities/platform-role.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { Plan } from 'src/master-db/entities/plan.entity';
import { Status, BillingModel, PaymentMode, CollectionType, Subscription } from 'src/master-db/entities/subscription.entity';
import { NotificationService } from './services/notification.service';
import { ActivityLogService } from './services/activity-log.service';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { TenantModule } from 'src/master-db/entities/tenant-modules.entity';
import { Module } from 'src/master-db/entities/module.entity';
import { WhatsappAccountService } from './services/whatsapp-account.service';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantProvisioningJob)
    private readonly jobRepo: Repository<TenantProvisioningJob>,
    @InjectRepository(TenantProvisioningLog)
    private readonly logRepo: Repository<TenantProvisioningLog>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
    @InjectRepository(TenantGeoPolicy)
    private readonly geoPolicyRepo: Repository<TenantGeoPolicy>,
    @InjectRepository(TenantTheme)
    private readonly themesRepo: Repository<TenantTheme>,
    @InjectRepository(TenantDbConfig)
    private readonly dbConfigRepo: Repository<TenantDbConfig>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    @InjectRepository(PlatformRole)
    private readonly platformRoleRepo: Repository<PlatformRole>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(TenantModule)
    private readonly tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(Module)
    private readonly moduleRepo: Repository<Module>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    private readonly whatsappAccountService: WhatsappAccountService,

    private readonly provisioningAdminService: ProvisioningAdminService,
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly notificationService: NotificationService,
    private readonly activityLogService: ActivityLogService,
  ) { }

  private async recordAction(action: string, description: string, actorId:string, actorType:ActivityLogActorType, metadata?: Record<string, any>) {
    await this.activityLogService.recordActivityLog({
      actorType: actorType,
      actorId: actorId,
      action,
      description,
      metadata: metadata ?? null,
    });
  }

  private async generateUniqueCode(): Promise<string> {
    while (true) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      const exists = await this.tenantRepo.findOne({
        where: { code },
      });

      if (!exists) {
        return code;
      }
    }
  }

  async resolveTenant(code: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { code, isActive: true },
      select: ['id', 'name', 'code'],
    });
    if (!tenant) {
      return null
    }
    return tenant
  }

  async getProvisioningList(user: any) {
    // 1️⃣ Fetch tenants
    const tenants = await this.tenantRepo.find({
      select: ['id', 'name', 'status', 'updatedAt'],
      order: { updatedAt: 'DESC' },
      relations: ['profile'],
    });

    // 2️⃣ For each tenant, get latest job
    const results = await Promise.all(
      tenants.map(async (tenant) => {
        const lastJob = await this.jobRepo.findOne({
          where: { tenant: { id: tenant.id } },
          order: { startedAt: 'DESC' },
        });

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantStatus: tenant.status,
          lastJobId: lastJob?.id ?? null,
          lastJobStatus: lastJob?.status ?? null,
          lastError: lastJob?.errorMessage ?? null,
          lastUpdatedAt: lastJob?.finishedAt ?? tenant.updatedAt,
        };
      }),
    );

    await this.recordAction('TENANT_PROVISIONING_LIST', 'Fetched tenant provisioning list', user.id, ActivityLogActorType.PLATFORM_USER, { total: results.length });
    return results;
  }

  async getProvisioningDetails(tenantId: string, user: any) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // 1️⃣ Fetch all jobs for tenant
    const jobs = await this.jobRepo.find({
      where: { tenant: { id: tenant.id } },
      order: { startedAt: 'DESC' },
    });

    // 2️⃣ Attach logs to each job
    const jobsWithLogs = await Promise.all(
      jobs.map(async (job) => {
        const logs = await this.logRepo.find({
          where: { job: { id: job.id } },
          order: { createdAt: 'ASC' },
        });

        return {
          jobId: job.id,
          status: job.status,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          errorMessage: job.errorMessage,
          logs: logs.map((log) => ({
            level: log.level,
            message: log.message,
            createdAt: log.createdAt,
          })),
        };
      }),
    );

    await this.recordAction('TENANT_PROVISIONING_DETAILS', 'Fetched tenant provisioning details', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId, jobsCount: jobsWithLogs.length });
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
      },
      jobs: jobsWithLogs,
    };
  }

  async getTenant(tenantId: string, user: any) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      relations: ['modules'] 
    });
    if(!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    await this.recordAction('TENANT_GET', 'Tenant fetched', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return tenant;
  }


  async createTenant(dto: CreateTenantDto,user: any) {
    // 1️⃣ Subdomain uniqueness check
    const nameExists = await this.tenantRepo.findOne({
      where: { name: dto.name },
    });

    const emailExists = await this.tenantRepo.findOne({
      where: { email: dto.email },
    });

    if (nameExists || emailExists) {
      throw new BadRequestException('Tenant name or email already exists');
    }

    // 2️⃣ Generate unique code
    const code = await this.generateUniqueCode();

    // 3️⃣ Create tenant identity
    const tenant = await this.tenantRepo.save(
      this.tenantRepo.create({
        name: dto.name,
        email: dto.email,
        code: code,
        status: TenantStatus.REGISTERED,
        industryType: dto.industryType
      }),
    );

    // 4️⃣ Create tenant subscription
    const plan = await this.planRepo.findOne({
      where: { id: dto.planId },
      relations: ['plan_limits'],
    });

    if(plan) {
      const expiry = plan.billing_cycle === "MONTHLY" ? new Date(new Date().setMonth(new Date().getMonth() + 1)) : new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      const subscription = new Subscription();
      subscription.tenant = tenant;
      subscription.plan = plan;
      subscription.billingModel = BillingModel.SELF_SERVE;
      subscription.paymentMode = PaymentMode.OFFLINE;
      subscription.collectionType = CollectionType.AUTO;

      subscription.status = Status.ACTIVE;
      subscription.expiresAt = expiry;
      subscription.cancelledAt = null;
      // console.log(subscription);
      await this.subscriptionRepo.save(subscription);
    }

    // create tenant profile
    const profile = new TenantProfile();
    profile.tenant = tenant;
    profile.displayName = dto.displayName;
    profile.supportEmail = dto.email;
    profile.phone = dto.phone;
    profile.address = dto.address;
    await this.profilesRepo.save(profile);


    if (plan && this.whatsappAccountService.planHasWhatsappLimit(plan)) {
      await this.whatsappAccountService.ensureDefaultWhatsappAccount(tenant.id, user, {
        displayPhoneNumber: dto.displayPhoneNumber,
        phoneCountryCode: dto.phoneCountryCode,
        phoneNationalNumber: dto.phoneNationalNumber,
      });
    }
    // 🔥 AUTO provisioning trigger (run in background, do not block API response)
    void this.startProvisioningSkeleton(tenant.id, user?.id).catch((error) => {
      this.logger.error(
        `Background provisioning failed to execute for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    await this.notificationService.createNotification({
      userId: user.id,
      title:  `Tenant ${tenant.name} has been created`,
      message: `Tenant ${tenant.name} is created. Provisioning is running in the background.`,
      type: 'success',
    });
    await this.recordAction('TENANT_CREATE', 'Tenant created and provisioning started', user.id, ActivityLogActorType.PLATFORM_USER, {
      tenantId: tenant.id,
      tenantName: tenant.name,
      userId: user?.id ?? null,
    });
    return tenant;
  }

  async startProvisioning(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });
    if(!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== TenantStatus.REGISTERED) {
      throw new ConflictException(
        `Cannot provision tenant in status ${tenant.status}`,
      );
    }

    tenant.status = TenantStatus.PROVISIONING;
    await this.tenantRepo.save(tenant);
    await this.recordAction('TENANT_PROVISIONING_START', 'Tenant provisioning started', null, ActivityLogActorType.SYSTEM, { tenantId });

    return {
      message: 'Provisioning started',
      status: tenant.status,
    };
  }

  async retryProvisioning(tenantId: string, user: any) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      relations: ['profile'],
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const runningJob = await this.jobRepo.findOne({
      where: {
        tenant: { id: tenant.id },
        status: 'RUNNING',
      },
    });

    if (runningJob) {
      throw new ConflictException('Provisioning already in progress');
    }

    if (tenant.status !== TenantStatus.FAILED) {
      throw new ConflictException(
        `Retry not allowed in status ${tenant.status}`,
      );
    }

    // 🔁 Start provisioning again
    await this.startProvisioningSkeleton(tenant.id, user?.id);
    await this.recordAction('TENANT_PROVISIONING_RETRY', 'Tenant provisioning retry started', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });

    return {
      message: 'Provisioning retry started',
    };
  }

  async startProvisioningSkeleton(tenantId: string, notifyUserId?: string) {

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return;

    // Create job
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        tenant,
        status: 'RUNNING',
      }),
    );

    // Move tenant to PROVISIONING
    tenant.status = TenantStatus.PROVISIONING;
    await this.tenantRepo.save(tenant);

    // Log
    await this.logRepo.save({
      job,
      level: 'INFO',
      message: 'Provisioning started (skeleton)',
    });

    try{
      // ===============================
      // 🔹 STEP 0: Setup Database & User
      // ===============================
      await this.provisioningAdminService.createAdminConnection();
      const dbName = `erp_t_${tenant.code}`;


      await this.provisioningAdminService.createDatabaseIfNotExists(dbName);
      // 🔹 Log: database created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Provison Tenant DB created',
      });
      
      const dbUser = `erp_u_${tenant.code}`;
      const existingConfig = await this.dbConfigRepo.findOne({
        where: { tenant: { id: tenant.id } },
      });

      let dbPass: string;

      if (existingConfig) {
        dbPass = existingConfig.password;
      } else {
        dbPass = this.generateStrongPassword();
      }

      await this.provisioningAdminService.createUserIfNotExists(dbUser, dbPass);
      
      // 🔹 Log: database user created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Provison Tenant DB User created',
      });

      await this.provisioningAdminService.grantPrivileges(dbName, dbUser);
      await this.provisioningAdminService.grantSchemaPrivileges(dbName, dbUser);

      // 🔹 Log: grant privileges
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB User Set Privileges',
      });

      await this.saveDbConfigIfNotExists(tenant, dbName, dbUser, dbPass);

      // 🔹 Log: database config created
      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB Config created',
      });
      await this.provisioningAdminService.closeConnection();


      // migrations
      await this.tenantDatabaseService.runMigrations(
        String(process.env.PROVISION_DB_HOST),
        Number(process.env.PROVISION_DB_PORT),
        dbUser,
        dbPass,
        dbName,
      );

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB migrations executed',
      });

      // seed data
      await this.tenantDatabaseService.runTenantSeeders(
        String(process.env.PROVISION_DB_HOST),
        Number(process.env.PROVISION_DB_PORT),
        dbUser,
        dbPass,
        dbName,
      );

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant DB core seed completed',
      });

      // sync tenant modules from master modules repo
      await this.createDefaultTenantModulesIfNotExists(tenant);

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant modules initialized',
      });

      // ===============================
      // 🔹 STEP 1: Create tenant settings
      // ===============================
      await this.createDefaultSettingsIfNotExists(tenant);

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default settings created',
      });


      // ===============================
      // 🔹 STEP 2: Create tenant theme
      // ===============================
      await this.createDefaultThemeIfNotExists(tenant);

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default theme created',
      });


      // ===============================
      // 🔹 STEP 3: Create tenant Geo Policy
      // ===============================
      await this.createDefaultGeoPolicyIfNotExists(tenant);

      await this.logRepo.save({
        job,
        level: 'INFO',
        message: 'Tenant default geo policy created',
      });
      // 🚧 STOP HERE — (future steps plug below)



      // 🔥 FINALIZE provisioning (CURRENT SCOPE)
      await this.markProvisioningSuccess(tenant, job, notifyUserId);
    } catch (e) {
      await this.markProvisioningFailed(tenant, job, e, notifyUserId);
    }
  }

  private async markProvisioningSuccess(
    tenant: Tenant,
    job: TenantProvisioningJob,
    notifyUserId?: string,
  ) {
    // Tenant status update
    tenant.status = TenantStatus.PROVISIONED;
    await this.tenantRepo.save(tenant);

    // Job status update
    job.status = 'SUCCESS';
    job.finishedAt = new Date();
    await this.jobRepo.save(job);

    // Log
    await this.logRepo.save({
      job,
      level: 'INFO',
      message: 'Provisioning completed successfully',
    });

    // trigger notification for requester when provisioning finishes
    if (notifyUserId) {
      await this.notificationService.createNotification({
        userId: notifyUserId,
        title: `Tenant ${tenant.name} provisioning completed`,
        message: `Tenant ${tenant.name} is fully provisioned and ready to use.`,
        type: 'success',
      });
    }

  }

  private async markProvisioningFailed(
    tenant,
    job,
    error,
    notifyUserId?: string,
  ) {
    const message = error instanceof Error ? error.message : 'Unknown provisioning error';
    // 1️⃣ Update tenant status
    tenant.status = TenantStatus.FAILED;
    await this.tenantRepo.save(tenant);

    // 2️⃣ Update job status
    job.status = 'FAILED';
    job.finishedAt = new Date();
    job.errorMessage = message;
    await this.jobRepo.save(job);

    // 3️⃣ Log error
    await this.logRepo.save({
      job,
      level: 'ERROR',
      message: `Provisioning failed: ${message}`,
    });

    if (notifyUserId) {
      await this.notificationService.createNotification({
        userId: notifyUserId,
        title: `Tenant ${tenant.name} provisioning failed`,
        message: `Provisioning failed for tenant ${tenant.name}: ${message}`,
        type: 'error',
      });
    }
  }
  
  async suspendTenant(tenantId: string, user: any) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ConflictException('Tenant already suspended');
    }

    tenant.status = TenantStatus.SUSPENDED;
    await this.tenantRepo.save(tenant);
    await this.recordAction('TENANT_SUSPEND', 'Tenant suspended', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });

    return {
      message: 'Tenant suspended successfully',
      tenantId: tenant.id,
      status: tenant.status,
    };
  }

  async resumeTenant(tenantId: string, user: any) {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== TenantStatus.SUSPENDED) {
      throw new ConflictException(
        `Cannot resume tenant from status ${tenant.status}`,
      );
    }

    tenant.status = TenantStatus.PROVISIONED;
    await this.tenantRepo.save(tenant);
    await this.recordAction('TENANT_RESUME', 'Tenant resumed', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });

    return {
      message: 'Tenant resumed successfully',
      tenantId: tenant.id,
      status: tenant.status,
    };
  }


  // sub functions

  private async saveDbConfigIfNotExists(
    tenant: Tenant,
    dbName: string,
    dbUser: string,
    dbPass: string,
  ) {
    const existing = await this.dbConfigRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.dbConfigRepo.save(
        this.dbConfigRepo.create({
          tenant,
          host: process.env.PROVISION_DB_HOST,
          port: Number(process.env.PROVISION_DB_PORT),
          database: dbName,
          username: dbUser,
          password: dbPass,
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultSettingsIfNotExists(tenant: Tenant) {
    const existing = await this.settingsRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.settingsRepo.save(
        this.settingsRepo.create({
          tenant,
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultGeoPolicyIfNotExists(tenant: Tenant) {
    const existing = await this.geoPolicyRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.geoPolicyRepo.save(
        this.geoPolicyRepo.create({
          tenant,
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultThemeIfNotExists(tenant: Tenant) {
    const existing = await this.themesRepo.findOne({
      where: { tenant: { id: tenant.id } },
    });

    if (!existing) {
      await this.themesRepo.save(
        this.themesRepo.create({
          tenant
        }),
      );

      return { created: true };
    }

    return { created: false };
  }

  private async createDefaultTenantModulesIfNotExists(tenant: Tenant) {
    const activeModules = await this.moduleRepo.find({
      where: { isActive: true },
    });

    if (!activeModules.length) {
      return { created: 0 };
    }

    const existingTenantModules = await this.tenantModuleRepo.find({
      where: { tenant: { id: tenant.id } },
      relations: ['module'],
    });

    const existingModuleIds = new Set(
      existingTenantModules.map((tenantModule) => tenantModule.module?.id),
    );

    const missingModules = activeModules.filter(
      (module) => !existingModuleIds.has(module.id),
    );

    if (!missingModules.length) {
      return { created: 0 };
    }

    await this.tenantModuleRepo.save(
      missingModules.map((module) =>
        this.tenantModuleRepo.create({
          tenant,
          module,
          enabled: module.key !== 'SQL_AGENT',
        }),
      ),
    );

    return { created: missingModules.length };
  }



  // tenant profile service

  async getTenantProfile(tenantId: string, user: any) {
    const profile = await this.profilesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    await this.recordAction('TENANT_PROFILE_GET', 'Tenant profile fetched', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return profile;
  }

  async updateTenantProfile(tenantId: string, dto: UpdateTenantProfileDto, user: any) {
    const profile = await this.profilesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    Object.assign(profile, dto);

    await this.profilesRepo.save(profile);
    await this.recordAction('TENANT_PROFILE_UPDATE', 'Tenant profile updated', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });

    return {
      message: 'Tenant profile updated successfully',
      profile,
    };
  }

  // tenant settings service

  async getTenantSettings(tenantId: string, user: any) {
    const settings = await this.settingsRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!settings) {
      throw new NotFoundException('Tenant settings not found');
    }

    await this.recordAction('TENANT_SETTINGS_GET', 'Tenant settings fetched', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return settings;
  }

  async updateTenantSettings(tenantId: string, dto: UpdateTenantSettingsDto, user: any) {
    const settings = await this.settingsRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!settings) {
      throw new NotFoundException('Tenant settings not found');
    }

    Object.assign(settings, dto);

    await this.settingsRepo.save(settings);
    await this.recordAction('TENANT_SETTINGS_UPDATE', 'Tenant settings updated', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });

    return {
      message: 'Tenant settings updated successfully',
      settings,
    };
  }

  // tenant theme service

  async getTenantThemes(tenantId: string, user: any) {
    const theme = await this.themesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!theme) {
      throw new NotFoundException('Tenant theme not found');
    }

    await this.recordAction('TENANT_THEME_GET', 'Tenant theme fetched', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return theme;
  }

  async updateTenantThemes(tenantId: string, dto: UpdateTenantThemeDto, user: any) {
    const theme = await this.themesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!theme) {
      throw new NotFoundException('Tenant theme not found');
    }

    Object.assign(theme, dto);

    await this.themesRepo.save(theme);
    await this.recordAction('TENANT_THEME_UPDATE', 'Tenant theme updated', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });

    return {
      message: 'Tenant theme updated successfully',
      theme,
    };
  }

  async updateTenantLogo(
    tenantId: string,
    logo: Express.Multer.File,
    user: any,
  ) {
    if (!logo) {
      throw new BadRequestException('Logo file is required');
    }

    const profile = await this.profilesRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!profile) {
      throw new NotFoundException('Tenant profile not found');
    }

    // 🔹 TEMP logic (future: S3 / Cloudinary)
    // make file name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `${uniqueSuffix}-${logo.originalname}`;

    profile.logoUrl = `/uploads/logos/${filename}`;

    await this.profilesRepo.save(profile);
    await this.recordAction('TENANT_LOGO_UPDATE', 'Tenant logo updated', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId, logoUrl: profile.logoUrl });

    return {
      message: 'Tenant logo updated successfully',
      logoUrl: profile.logoUrl,
    };
  }

  // get tenant geo policy

  async getTenantGeoPolicy(tenantId: string, user: any) {
    const geoPolicy = await this.geoPolicyRepo.findOne({
      where: { tenant: { id: tenantId } },
    });
    if (!geoPolicy) {
      throw new NotFoundException('Tenant geo policy not found');
    }
    await this.recordAction('TENANT_GEO_POLICY_GET', 'Tenant geo policy fetched', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return geoPolicy;
  } 
  async updateTenantGeoPolicy(tenantId: string, dto: UpdateTenantGeoPolicyDto, user: any) {
    const geoPolicy = await this.geoPolicyRepo.findOne({
      where: { tenant: { id: tenantId } },
    });
    if (!geoPolicy) {
      throw new NotFoundException('Tenant geo policy not found');
    }
    Object.assign(geoPolicy, dto);
    await this.geoPolicyRepo.save(geoPolicy);
    await this.recordAction('TENANT_GEO_POLICY_UPDATE', 'Tenant geo policy updated', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return {
      message: 'Tenant geo policy updated successfully',
      geoPolicy,
    };
  }

  // get tenant modules
  async getTenantModules(tenantId: string, user: any) {
    const modules = await this.tenantModuleRepo.find({
      where: { tenant: { id: tenantId } },
      relations: ['module'],
    });
    await this.recordAction('TENANT_MODULES_GET', 'Tenant modules fetched', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId });
    return modules;
  }

  async updateTenantModuleStatus(tenantId: string, moduleId: string, isActive: boolean, user: any) {
    const module = await this.tenantModuleRepo.findOne({
      where: { tenant: { id: tenantId }, module: { id: moduleId } },
    });
    if (!module) {
      throw new NotFoundException('Tenant module not found');
    }
    module.enabled = isActive;
    await this.tenantModuleRepo.save(module);
    await this.recordAction('TENANT_MODULE_STATUS_UPDATE', 'Tenant module status updated', user.id, ActivityLogActorType.PLATFORM_USER, { tenantId, moduleId, isActive });
    return {
      message: 'Tenant module status updated successfully',
      module,
    };
  }


  private generateStrongPassword(length = 16): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    
    return result;
  }




}
