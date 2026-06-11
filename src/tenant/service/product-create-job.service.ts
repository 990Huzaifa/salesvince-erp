import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { S3Service } from 'src/common/s3/s3.service';
import { ASSET_RULES, AssetPurpose } from '../config/asset-rules.config';
import { CreateProductAsyncDto } from '../dto/product/create-product-async.dto';
import {
  snapshotUploadedFile,
  UploadedFileSnapshot,
} from '../utils/snapshot-uploaded-file';
import { ActivityLogService } from './activity-log.service';
import { NotificationService } from './notification.service';
import { ProductService } from './product.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ProductCreateJobService {
  private readonly logger = new Logger(ProductCreateJobService.name);

  constructor(
    private readonly productService: ProductService,
    private readonly tenantJobService: TenantJobService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly s3Service: S3Service,
  ) {}

  async createAsync(
    tenantDb: DataSource,
    tenantCode: string,
    dto: CreateProductAsyncDto,
    uploadedFile: Express.Multer.File | undefined,
    user: any,
  ) {
    const fileSnapshot = snapshotUploadedFile(uploadedFile, 'file');
    this.validateImageFile(fileSnapshot);
    await this.productService.validateForCreate(tenantDb, dto, user);

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PRODUCT_CREATE',
      fileName: dto.name.trim(),
      createdBy: user.userId,
      totalRows: 1,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Product creation started for ${dto.name.trim()}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        productName: dto.name.trim(),
      },
    });

    void this.processCreateJob(tenantDb, job.id, tenantCode, dto, fileSnapshot, user).catch(
      (error) => {
        this.logger.error(
          `Product create job ${job.id} failed unexpectedly`,
          error instanceof Error ? error.stack : undefined,
        );
      },
    );

    return {
      message: 'Product creation started',
      jobId: job.id,
      status: job.status,
      productName: dto.name.trim(),
    };
  }

  private validateImageFile(file: UploadedFileSnapshot | undefined): void {
    if (!file) {
      return;
    }

    const rules = ASSET_RULES[AssetPurpose.PRODUCT_IMAGE];
    const allowedMimeTypes = rules.allowedMimeTypes as readonly string[];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File MIME type ${file.mimetype} is not allowed. Allowed: ${allowedMimeTypes.join(', ')}`,
      );
    }

    if (file.size > rules.maxSizeBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${rules.maxSizeBytes} bytes`,
      );
    }
  }

  private resolveImageExtension(file: UploadedFileSnapshot): string {
    const fromMime = MIME_TO_EXTENSION[file.mimetype];
    if (!fromMime) {
      throw new BadRequestException('Could not map image MIME type to an extension');
    }

    let ext = extname(file.originalname).toLowerCase().replace(/^\./, '');
    if (ext === 'jpeg') {
      ext = 'jpg';
    }

    const allowedForMime: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
    };
    const names = allowedForMime[file.mimetype];
    if (ext && names?.includes(ext)) {
      return ext;
    }

    return fromMime;
  }

  private async uploadProductImageFile(
    tenantCode: string,
    file: UploadedFileSnapshot,
  ): Promise<{ key: string; url: string }> {
    const rules = ASSET_RULES[AssetPurpose.PRODUCT_IMAGE];
    const extension = this.resolveImageExtension(file);
    const key = `tenants/${tenantCode}/${rules.folder}/${randomUUID()}.${extension}`;

    const uploaded = await this.s3Service.uploadObject(
      key,
      file.buffer,
      file.mimetype,
    );

    return { key: uploaded.key, url: uploaded.url };
  }

  private async processCreateJob(
    tenantDb: DataSource,
    jobId: string,
    tenantCode: string,
    dto: CreateProductAsyncDto,
    file: UploadedFileSnapshot | undefined,
    user: any,
  ): Promise<void> {
    this.tenantJobService.startJob(jobId);

    let uploadedKey: string | null = null;
    let imageUrl: string | null = null;

    try {
      if (file) {
        const uploaded = await this.uploadProductImageFile(tenantCode, file);
        uploadedKey = uploaded.key;
        imageUrl = uploaded.url;
      }

      const createdProduct = await this.productService.createWithImageUrl(
        tenantDb,
        dto,
        imageUrl,
        user,
      );

      this.tenantJobService.appendLog(jobId, {
        row: 1,
        name: dto.name.trim(),
        status: 'success',
        metadata: {
          productId: createdProduct.id,
          skuCode: createdProduct.skuCode,
        },
      });

      const completedJob = this.tenantJobService.completeJob(jobId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'PRODUCT_CREATED',
        description: `Product ${createdProduct.name} created`,
        metadata: { productId: createdProduct.id, skuCode: createdProduct.skuCode, jobId },
      });

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_COMPLETED',
        description: `Product creation completed for ${dto.name.trim()}`,
        metadata: {
          jobId: completedJob.id,
          jobType: completedJob.jobType,
          productId: createdProduct.id,
        },
      });

      const product = await this.productService.view(tenantDb, createdProduct.id, user);

      await this.notifyJobCompletion(
        tenantDb,
        completedJob,
        user,
        tenantCode,
        'completed',
        product,
      );
    } catch (error) {
      if (uploadedKey) {
        await this.s3Service.deleteObject(uploadedKey).catch(() => undefined);
      }

      this.tenantJobService.appendLog(jobId, {
        row: 1,
        name: dto.name.trim(),
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.tenantJobService.failJob(jobId);

      const failedJob = this.tenantJobService.getJobById(jobId, tenantCode, user.userId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_FAILED',
        description: `Product creation failed for ${dto.name.trim()}`,
        metadata: {
          jobId,
          jobType: failedJob.jobType,
          productName: dto.name.trim(),
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await this.notifyJobCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
        null,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async notifyJobCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
    product: unknown | null,
    error?: string,
  ): Promise<void> {
    const title =
      status === 'completed' ? 'Product creation completed' : 'Product creation failed';
    const message =
      status === 'completed'
        ? `Product "${job.fileName}" was created successfully.`
        : `Product creation failed for "${job.fileName}". ${error ?? 'Please review job logs.'}`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        businessId: user.businessId,
        title,
        message,
        type: 'product_create',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
        product: product ?? undefined,
        error: error ?? undefined,
      },
    );
  }
}
