import { IsString, MinLength } from 'class-validator';

export class ResolveTenantDto {
    @IsString()
    @MinLength(2)
    code: string;
}
