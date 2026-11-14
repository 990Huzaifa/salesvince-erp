import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PurgeWarehouseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  warehouseCode: string;
}
