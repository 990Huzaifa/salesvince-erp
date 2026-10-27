import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod } from 'src/tenant-db/entities/voucher.entity';

export class UpdateBusinessSettingsDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(PaymentMethod)
  defaultPaymentMethod?: PaymentMethod | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultVoucherPaymentCoaId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultDocumentTemplateId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultWarehouseId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultCountryId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultStateId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultCityId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  @Type(() => Object)
  extras?: Record<string, unknown> | null;
}
