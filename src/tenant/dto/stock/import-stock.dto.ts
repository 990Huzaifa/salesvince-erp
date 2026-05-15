import { IsDateString, IsIn, IsUUID } from 'class-validator';

export class ImportStockDto {
  @IsIn(['OPENING', 'PURCHASE'])
  type: 'OPENING' | 'PURCHASE';

  @IsUUID()
  distributorId: string;

  @IsDateString()
  date: string;
}
