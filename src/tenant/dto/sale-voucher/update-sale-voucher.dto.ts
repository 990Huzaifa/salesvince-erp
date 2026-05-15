import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSaleVoucherDto } from './create-sale-voucher.dto';

/** Status changes must use the dedicated status endpoint (ledger posting). */
export class UpdateSaleVoucherDto extends PartialType(
  OmitType(CreateSaleVoucherDto, ['status'] as const),
) {}
