import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { AssetEntityType, AssetPurpose } from '../../config/asset-rules.config';

const MAX_FILES_PER_REQUEST = 20;

export class AssetUploadFileDescriptorDto {
    @IsString()
    @MaxLength(512)
    originalFileName: string;

    @IsString()
    @MaxLength(255)
    mimeType: string;

    @IsInt()
    @Min(1)
    fileSize: number;
}

export class CreateAssetUploadRequestDto {
    @IsEnum(AssetPurpose)
    purpose: AssetPurpose;

    @IsOptional()
    @IsUUID('4')
    entityId?: string;

    @IsOptional()
    @IsEnum(AssetEntityType)
    entityType?: AssetEntityType;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_FILES_PER_REQUEST)
    @ValidateNested({ each: true })
    @Type(() => AssetUploadFileDescriptorDto)
    files: AssetUploadFileDescriptorDto[];
}
