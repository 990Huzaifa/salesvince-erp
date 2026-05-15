import { IsDateString, IsNumber, IsUUID, Min } from 'class-validator';

export class GetRetailerSchemesDto {
  @IsUUID()
  retailerId: string;

  @IsDateString()
  orderDate: string;

  @IsNumber()
  @Min(0)
  orderTotal: number;
}
