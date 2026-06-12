import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { S3Service } from 'src/common/s3/s3.service';
import { ASSET_RULES, AssetPurpose } from '../config/asset-rules.config';
import { CreateProductAsyncDto } from '../dto/product/create-product-async.dto';
import { UpdateProductAsyncDto } from '../dto/product/update-product-async.dto';
import { extractS3KeyFromUrl } from '../utils/extract-s3-key-from-url';
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

  async updateAsync(
    tenantDb: DataSource,
    tenantCode: string,
    productId: string,
    dto: UpdateProductAsyncDto,
    uploadedFile: Express.Multer.File | undefined,
    user: any,
  ) {
    const fileSnapshot = snapshotUploadedFile(uploadedFile, 'file');
    this.validateImageFile(fileSnapshot);

    if (fileSnapshot && dto.removeImage) {
      throw new BadRequestException(
        'Cannot upload a new image and set removeImage at the same time',
      );
    }

    if (!fileSnapshot && !dto.removeImage && !this.hasUpdateFields(dto)) {
      throw new BadRequestException(
        'At least one product field, image file, or removeImage is required',
      );
    }

    const product = await this.productService.validateForUpdate(
      tenantDb,
      productId,
      dto,
      user,
    );

    const jobLabel = dto.name?.trim() || product.name;

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PRODUCT_UPDATE',
      fileName: jobLabel,
      createdBy: user.userId,
      totalRows: 1,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Product update started for ${jobLabel}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        productId,
        productName: jobLabel,
      },
    });

    void this.processUpdateJob(
      tenantDb,
      job.id,
      tenantCode,
      productId,
      dto,
      fileSnapshot,
      user,
      jobLabel,
      product.image,
    ).catch((error) => {
      this.logger.error(
        `Product update job ${job.id} failed unexpectedly`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    return {
      message: 'Product update started',
      jobId: job.id,
      status: job.status,
      productId,
      productName: jobLabel,
    };
  }

  private hasUpdateFields(dto: UpdateProductAsyncDto): boolean {
    const { removeImage: _removeImage, ...fields } = dto;
    return Object.values(fields).some((value) => value !== undefined);
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
        'create',
      );
    } catch (error) {
      await this.handleJobFailure(
        tenantDb,
        jobId,
        tenantCode,
        dto.name.trim(),
        user,
        uploadedKey,
        error,
        'create',
      );
    }
  }

  private async processUpdateJob(
    tenantDb: DataSource,
    jobId: string,
    tenantCode: string,
    productId: string,
    dto: UpdateProductAsyncDto,
    file: UploadedFileSnapshot | undefined,
    user: any,
    jobLabel: string,
    existingImageUrl: string | null,
  ): Promise<void> {
    this.tenantJobService.startJob(jobId);

    let uploadedKey: string | null = null;
    const previousImageKey = extractS3KeyFromUrl(existingImageUrl);

    try {
      let imageUpdate: string | null | undefined;
      if (file) {
        const uploaded = await this.uploadProductImageFile(tenantCode, file);
        uploadedKey = uploaded.key;
        imageUpdate = uploaded.url;
      } else if (dto.removeImage) {
        imageUpdate = null;
      }

      const updatedProduct = await this.productService.updateWithImageUrl(
        tenantDb,
        productId,
        dto,
        imageUpdate,
        user,
      );

      if (imageUpdate !== undefined && previousImageKey && previousImageKey !== uploadedKey) {
        await this.s3Service.deleteObject(previousImageKey).catch(() => undefined);
      }

      this.tenantJobService.appendLog(jobId, {
        row: 1,
        name: jobLabel,
        status: 'success',
        metadata: {
          productId: updatedProduct.id,
          skuCode: updatedProduct.skuCode,
        },
      });

      const completedJob = this.tenantJobService.completeJob(jobId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'PRODUCT_UPDATED',
        description: `Product ${updatedProduct.name} updated`,
        metadata: { productId: updatedProduct.id, skuCode: updatedProduct.skuCode, jobId },
      });

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_COMPLETED',
        description: `Product update completed for ${jobLabel}`,
        metadata: {
          jobId: completedJob.id,
          jobType: completedJob.jobType,
          productId: updatedProduct.id,
        },
      });

      const product = await this.productService.view(tenantDb, updatedProduct.id, user);

      await this.notifyJobCompletion(
        tenantDb,
        completedJob,
        user,
        tenantCode,
        'completed',
        product,
        'update',
      );
    } catch (error) {
      await this.handleJobFailure(
        tenantDb,
        jobId,
        tenantCode,
        jobLabel,
        user,
        uploadedKey,
        error,
        'update',
        productId,
      );
    }
  }

  private async handleJobFailure(
    tenantDb: DataSource,
    jobId: string,
    tenantCode: string,
    jobLabel: string,
    user: any,
    uploadedKey: string | null,
    error: unknown,
    operation: 'create' | 'update',
    productId?: string,
  ): Promise<void> {
    if (uploadedKey) {
      await this.s3Service.deleteObject(uploadedKey).catch(() => undefined);
    }

    this.tenantJobService.appendLog(jobId, {
      row: 1,
      name: jobLabel,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    this.tenantJobService.failJob(jobId);

    const failedJob = this.tenantJobService.getJobById(jobId, tenantCode, user.userId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_FAILED',
      description:
        operation === 'create'
          ? `Product creation failed for ${jobLabel}`
          : `Product update failed for ${jobLabel}`,
      metadata: {
        jobId,
        jobType: failedJob.jobType,
        productName: jobLabel,
        productId,
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
      operation,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }

  private async notifyJobCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
    product: unknown | null,
    operation: 'create' | 'update',
    error?: string,
  ): Promise<void> {
    const titles = {
      create: {
        completed: 'Product creation completed',
        failed: 'Product creation failed',
      },
      update: {
        completed: 'Product update completed',
        failed: 'Product update failed',
      },
    };
    const title = titles[operation][status];
    const message =
      status === 'completed'
        ? operation === 'create'
          ? `Product "${job.fileName}" was created successfully.`
          : `Product "${job.fileName}" was updated successfully.`
        : operation === 'create'
          ? `Product creation failed for "${job.fileName}". ${error ?? 'Please review job logs.'}`
          : `Product update failed for "${job.fileName}". ${error ?? 'Please review job logs.'}`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        businessId: user.businessId,
        title,
        message,
        type: operation === 'create' ? 'product_create' : 'product_update',
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
