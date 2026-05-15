import { IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateNotificationDto {
    @IsUUID()
    userId?: string;

    @IsString()
    title?: string;

    @IsString()
    message?: string;

    @IsString()
    type?: string;

    @IsOptional()
    @IsBoolean()
    isRead?: boolean;
}
