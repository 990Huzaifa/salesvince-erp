import { IsString, Matches } from 'class-validator';

export class CreatePinDto {
  @IsString()
  @Matches(/^\d{4,6}$/, {
    message: 'PIN must be 4 to 6 digits',
  })
  pin: string;
}
