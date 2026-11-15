import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleReturnMode } from 'src/tenant-db/entities/sale-return.entity';
import { CreateSaleReturnItemDto } from './create-sale-return-item.dto';

export class CreateSaleReturnDto {
  @IsEnum(SaleReturnMode)
  returnMode: SaleReturnMode;

  @ValidateIf((o: CreateSaleReturnDto) => o.returnMode === SaleReturnMode.INVOICE)
  @IsUUID()
  saleInvoiceId?: string;

  @ValidateIf((o: CreateSaleReturnDto) => o.returnMode === SaleReturnMode.CUSTOMER)
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  returnNumber?: string;

  @IsDateString()
  returnDate: string;

  @IsString()
  @MaxLength(2000)
  returnReason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnItemDto)
  items: CreateSaleReturnItemDto[];
}
