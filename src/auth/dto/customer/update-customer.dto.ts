import { IsString, IsEmail, IsPhoneNumber, IsOptional } from 'class-validator';

export class UpdateCustomerDto {
    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    fullName?: string;

    @IsPhoneNumber()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    country?: string;
}
