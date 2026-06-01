import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreatePurchaseReturnDto } from './create-purchase-return.dto';

export class UpdatePurchaseReturnDto extends PartialType(
  PickType(CreatePurchaseReturnDto, [
    'returnNumber',
    'returnDate',
    'returnReason',
  ] as const),
) {}
