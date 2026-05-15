import { IsString, IsEmail, IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class RegisterCustomerDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    fullName: string;

    @IsString()
    @IsNotEmpty()
    passwordHash: string;  // hashed password

    @IsPhoneNumber()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsNotEmpty()
    country: string;
}
