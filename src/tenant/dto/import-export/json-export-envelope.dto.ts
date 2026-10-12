import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const SALESVINCE_EXPORT_FORMAT = 'salesvince.export' as const;

export enum JsonExportEntity {
  PARTIES = 'parties',
  PRODUCTS = 'products',
}

export enum JsonImportMode {
  UPSERT = 'upsert',
  CREATE_ONLY = 'createOnly',
}

export class JsonImportOptionsDto {
  @IsOptional()
  @IsEnum(JsonImportMode)
  mode?: JsonImportMode = JsonImportMode.UPSERT;
}

/** Shared import envelope; entity-specific DTOs nest typed items. */
export class JsonExportEnvelopeBaseDto {
  @IsOptional()
  @IsIn([SALESVINCE_EXPORT_FORMAT])
  format?: typeof SALESVINCE_EXPORT_FORMAT;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  version?: number;

  @IsOptional()
  @IsEnum(JsonExportEntity)
  entity?: JsonExportEntity;

  @IsOptional()
  @IsString()
  exportedAt?: string;
}

export type JsonImportResultRow = {
  index: number;
  key: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
  id?: string;
};

export type JsonImportResult = {
  entity: JsonExportEntity;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: JsonImportResultRow[];
};
