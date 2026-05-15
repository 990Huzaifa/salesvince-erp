import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginCustomerDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    passwordHash: string;
}
