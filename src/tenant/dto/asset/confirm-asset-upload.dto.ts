import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ConfirmAssetUploadDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    assetIds: string[];
}
