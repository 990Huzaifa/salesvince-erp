import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum TradingLedgerDocumentType {
  GRN = 'GRN',
  PURCHASE_RETURN = 'PURCHASE_RETURN',
  DELIVERY_NOTE = 'DELIVERY_NOTE',
  SALE_RETURN = 'SALE_RETURN',
}

/** Must match body.confirm when dryRun=false. */
export const BACKFILL_TRADING_LEDGER_CONFIRM = 'BACKFILL_TRADING_LEDGER';

export class BackfillTradingLedgerDto {
  /**
   * Default true. When true, only scans and reports — no ledger writes.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() !== 'false' && value !== '0';
    }
    return Boolean(value);
  })
  @IsBoolean()
  dryRun?: boolean = true;

  /**
   * Required when dryRun=false. Must equal BACKFILL_TRADING_LEDGER.
   */
  @IsOptional()
  @IsString()
  confirm?: string;

  /**
   * When true (and dryRun=false), deletes existing journal for the doc then reposts.
   * Default false: docs that already have any ledger rows are skipped.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  })
  @IsBoolean()
  forceRepost?: boolean = false;

  @IsOptional()
  @IsArray()
  @IsEnum(TradingLedgerDocumentType, { each: true })
  documentTypes?: TradingLedgerDocumentType[];
}
