import { IsUUID } from 'class-validator';

export class SendToVendorDto {
  @IsUUID()
  vendorId: string;
}
