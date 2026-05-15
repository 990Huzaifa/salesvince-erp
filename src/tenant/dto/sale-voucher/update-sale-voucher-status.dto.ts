import { IsEnum } from 'class-validator';
import { SaleVoucherStatus } from 'src/tenant-db/entities/sale-voucher.entity';

export class UpdateSaleVoucherStatusDto {
  @IsEnum(SaleVoucherStatus)
  status: SaleVoucherStatus;
}
