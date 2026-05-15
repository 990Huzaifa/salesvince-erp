import { IsString } from 'class-validator';

export class CreateRetailerChannelDto {
  @IsString()
  name: string;
}
