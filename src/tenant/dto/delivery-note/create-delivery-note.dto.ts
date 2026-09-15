import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { DeliveryNoteStatus } from 'src/tenant-db/entities/delivery-note.entity';

const CREATE_DELIVERY_NOTE_STATUSES = [
  DeliveryNoteStatus.PENDING,
  DeliveryNoteStatus.APPROVED,
] as const;

export class CreateDeliveryNoteDto {
  @IsUUID()
  saleOrderId: string;

  @IsDateString()
  deliveryNoteDate: string;

  /** Set by create-and-approve endpoint; clients should not send this. */
  @IsOptional()
  @IsIn(CREATE_DELIVERY_NOTE_STATUSES)
  status?: DeliveryNoteStatus;
}
