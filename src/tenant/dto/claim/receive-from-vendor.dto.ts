import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ReceiveFromVendorItemDto } from './receive-from-vendor-item.dto';

export class ReceiveFromVendorDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveFromVendorItemDto)
  items: ReceiveFromVendorItemDto[];
}
