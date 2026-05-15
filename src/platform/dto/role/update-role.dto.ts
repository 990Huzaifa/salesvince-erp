import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";



export class UpdateRoleDto {
    @IsString()
    @IsOptional()
    code: string;

    @IsString()
    @IsOptional()
    name: string;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean

    @IsArray()
    @IsString({ each: true })
    permissions: string[];
}