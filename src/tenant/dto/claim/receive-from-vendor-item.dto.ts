import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUUID, Min } from 'class-validator';

export enum ClaimVendorItemDecision {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export class ReceiveFromVendorItemDto {
  @IsUUID()
  claimItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(ClaimVendorItemDecision)
  decision: ClaimVendorItemDecision;
}
