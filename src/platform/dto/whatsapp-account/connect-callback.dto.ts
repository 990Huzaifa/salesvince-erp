import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConnectCallbackDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsOptional()
    @IsString()
    redirectUri?: string;
}
