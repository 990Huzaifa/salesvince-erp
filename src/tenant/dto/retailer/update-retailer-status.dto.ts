import { IsEnum } from 'class-validator';
import { Status } from 'src/tenant-db/entities/retailer.entity';

export class UpdateRetailerStatusDto {
  @IsEnum(Status)
  status: Status;
}
