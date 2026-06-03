import { IsOptional, IsString } from 'class-validator';

export class CreateWhatsappAccountDto {
    @IsOptional()
    @IsString()
    displayPhoneNumber?: string;

    @IsOptional()
    @IsString()
    phoneCountryCode?: string;

    @IsOptional()
    @IsString()
    phoneNationalNumber?: string;
}
