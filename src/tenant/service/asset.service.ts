import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { S3Service } from 'src/common/s3/s3.service';
import { Asset, AssetStatus } from 'src/tenant-db/entities/asset.entity';
import { DataSource } from 'typeorm';
import { basename, extname } from 'path';
import { randomUUID } from 'crypto';
import { ASSET_RULES, AssetPurpose } from '../config/asset-rules.config';
import { CreateAssetUploadRequestDto } from '../dto/asset/create-asset-upload-request.dto';
import { ConfirmAssetUploadDto } from '../dto/asset/confirm-asset-upload.dto';

const PRESIGNED_PUT_EXPIRES_SEC = 15 * 60;

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

const EXTENSION_TO_MIME: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};

export type AssetUploadRequestItemResult = {
    assetId: string;
    preSignedUploadUrl: string;
    s3Key: string;
    expiresInSeconds: number;
    contentType: string;
};

export type ConfirmAssetUploadItemResult = {
    assetId: string;
    status: AssetStatus;
};

@Injectable()
export class AssetService {
    constructor(private readonly s3Service: S3Service) { }

    async createUploadRequests(
        tenantDb: DataSource,
        tenantId: string,
        tenantCode: string,
        dto: CreateAssetUploadRequestDto,
        user: any,
    ): Promise<{ uploads: AssetUploadRequestItemResult[] }> {
        const rules = ASSET_RULES[dto.purpose];
        if (!rules) {
            throw new BadRequestException('Unsupported asset purpose');
        }

        if (dto.files.length > rules.maxFiles) {
            throw new BadRequestException(
                `At most ${rules.maxFiles} file(s) allowed for purpose ${dto.purpose}`,
            );
        }

        if (dto.entityType !== undefined) {
            const allowedEntityTypes = rules.allowedEntityTypes as readonly string[];
            if (!allowedEntityTypes.includes(dto.entityType)) {
                throw new BadRequestException(
                    `entityType ${dto.entityType} is not allowed for purpose ${dto.purpose}`,
                );
            }
        }

        const allowedMimeTypes = rules.allowedMimeTypes as readonly string[];
        for (const file of dto.files) {
            if (!allowedMimeTypes.includes(file.mimeType)) {
                throw new BadRequestException(
                    `MIME type ${file.mimeType} is not allowed for purpose ${dto.purpose}`,
                );
            }
            if (file.fileSize > rules.maxSizeBytes) {
                throw new BadRequestException(
                    `File ${file.originalFileName} exceeds maximum size of ${rules.maxSizeBytes} bytes`,
                );
            }
        }

        const repo = tenantDb.getRepository(Asset);
        const uploads: AssetUploadRequestItemResult[] = [];

        for (const file of dto.files) {
            const assetId = randomUUID();
            const extension = this.resolveSafeExtension(file.originalFileName, file.mimeType);
            const s3Key = `tenants/${tenantCode}/temp/uploads/${assetId}.${extension}`;

            const asset = repo.create({
                id: assetId,
                uploadedById: user.userId,
                purpose: dto.purpose,
                s3Key,
                entityType: dto.entityType ?? null,
                entityId: dto.entityId ?? null,
                originalFileName: this.sanitizeOriginalFileName(file.originalFileName),
                fileExtension: extension,
                fileSize: file.fileSize,
                status: AssetStatus.PENDING,
                confirmedAt: null,
                attachedAt: null,
            });

            await repo.save(asset);

            try {
                const preSignedUploadUrl = await this.s3Service.getPresignedPutObjectUrl(
                    s3Key,
                    file.mimeType,
                    PRESIGNED_PUT_EXPIRES_SEC,
                );
                uploads.push({
                    assetId,
                    preSignedUploadUrl,
                    s3Key,
                    expiresInSeconds: PRESIGNED_PUT_EXPIRES_SEC,
                    contentType: file.mimeType,
                });
            } catch (err) {
                await repo.delete({ id: assetId });
                throw err;
            }
        }

        return { uploads };
    }

    async confirmUploads(
        tenantDb: DataSource,
        tenantId: string,
        tenantCode: string,
        dto: ConfirmAssetUploadDto,
        user: any,
    ): Promise<{ results: ConfirmAssetUploadItemResult[] }> {
        const repo = tenantDb.getRepository(Asset);
        const results: ConfirmAssetUploadItemResult[] = [];

        for (const assetId of dto.assetIds) {
            const asset = await repo.findOne({ where: { id: assetId } });
            if (!asset) {
                throw new NotFoundException(`Asset ${assetId} not found`);
            }

            if (asset.uploadedById !== user.userId) {
                throw new ForbiddenException(`Not allowed to confirm asset ${assetId}`);
            }

            if (asset.status !== AssetStatus.PENDING) {
                throw new BadRequestException(
                    `Asset ${assetId} is not pending confirmation (status: ${asset.status})`,
                );
            }

            const expectedPrefix = `tenants/${tenantCode}/temp/uploads/${asset.id}.`;
            if (!asset.s3Key.startsWith(expectedPrefix)) {
                throw new BadRequestException(`Asset ${assetId} has an unexpected storage key`);
            }

            const rules = ASSET_RULES[asset.purpose as AssetPurpose];
            if (!rules) {
                throw new BadRequestException(`Unknown purpose on asset ${assetId}`);
            }

            if (asset.entityType) {
                const allowed = rules.allowedEntityTypes as readonly string[];
                if (!allowed.includes(asset.entityType)) {
                    throw new BadRequestException(
                        `entityType ${asset.entityType} does not match purpose ${asset.purpose}`,
                    );
                }
            }

            let head;
            try {
                head = await this.s3Service.headObject(asset.s3Key);
            } catch (err: unknown) {
                const statusCode =
                    err && typeof err === 'object' && '$metadata' in err
                        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
                            ?.httpStatusCode
                        : undefined;
                const name =
                    err && typeof err === 'object' && 'name' in err
                        ? String((err as { name: string }).name)
                        : '';
                if (statusCode === 404 || name === 'NotFound') {
                    throw new BadRequestException(
                        `Object for asset ${assetId} was not found in storage; upload may have failed`,
                    );
                }
                throw err;
            }

            // const contentLength = head.ContentLength ?? 0;
            // if (contentLength !== asset.fileSize) {
            //     throw new BadRequestException(
            //         `Stored size for asset ${assetId} does not match declared size ${contentLength}`,
            //     );
            // }

            // if (
            //     head.ContentType &&
            //     !(rules.allowedMimeTypes as readonly string[]).includes(head.ContentType)
            // ) {
            //     throw new BadRequestException(
            //         `Stored content type for asset ${assetId} is not allowed for its purpose`,
            //     );
            // }

            const oldKey = asset.s3Key;
            const destKey = `tenants/${tenantCode}/${rules.folder}/${asset.id}.${asset.fileExtension}`;
            const contentType = this.resolveContentType(asset.fileExtension);

            await this.s3Service.copyObject(oldKey, destKey, contentType);

            asset.s3Key = destKey;
            asset.status = AssetStatus.APPROVED;
            asset.confirmedAt = new Date();
            try {
                await repo.save(asset);
            } catch (err) {
                await this.s3Service.deleteObject(destKey).catch(() => undefined);
                throw err;
            }

            await this.s3Service.deleteObject(oldKey).catch(() => undefined);

            results.push({ assetId: asset.id, status: AssetStatus.APPROVED });
        }

        return { results };
    }

    private sanitizeOriginalFileName(name: string): string {
        const base = basename(name).trim();
        return base.length > 0 ? base.slice(0, 512) : 'unnamed';
    }

    private resolveSafeExtension(originalFileName: string, mimeType: string): string {
        const fromMime = MIME_TO_EXTENSION[mimeType];
        if (!fromMime) {
            throw new BadRequestException('Could not map MIME type to an extension');
        }

        let ext = extname(originalFileName).toLowerCase().replace(/^\./, '');
        if (ext === 'jpeg') {
            ext = 'jpg';
        }

        const allowedForMime: Record<string, string[]> = {
            'image/jpeg': ['jpg', 'jpeg'],
            'image/png': ['png'],
            'image/webp': ['webp'],
        };
        const names = allowedForMime[mimeType];
        if (!names) {
            throw new BadRequestException('Unsupported MIME type for extension resolution');
        }

        if (ext && names.includes(ext)) {
            return ext;
        }

        return fromMime;
    }

    private resolveContentType(fileExtension: string): string {
        const contentType = EXTENSION_TO_MIME[fileExtension.toLowerCase()];
        if (!contentType) {
            throw new BadRequestException('Unsupported file extension for content type resolution');
        }

        return contentType;
    }
}
