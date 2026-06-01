import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreateSaleReturnDto } from './create-sale-return.dto';

export class UpdateSaleReturnDto extends PartialType(
  PickType(CreateSaleReturnDto, [
    'returnNumber',
    'returnDate',
    'returnReason',
  ] as const),
) {}
