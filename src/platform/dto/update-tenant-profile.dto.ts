import { IsOptional, IsString, IsEmail } from 'class-validator';

export class UpdateTenantProfileDto {
    @IsOptional()
    @IsString()
    displayName?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsEmail()
    supportEmail?: string;
}
