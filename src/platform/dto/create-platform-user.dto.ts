import { IsOptional, IsString, IsEmail } from 'class-validator';
import { PlatformRole } from 'src/master-db/entities/platform-role.entity';

export class CreatePlatformUserDto {
    
    @IsEmail()
    email?: string;

    @IsString()
    fullname?: string;

    @IsString()
    passwordHash?: string;

    @IsString()    
    role?: PlatformRole;
}
