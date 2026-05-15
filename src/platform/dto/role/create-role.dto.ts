import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";



export class CreateRoleDto {
    @IsString()
    code: string;

    @IsString()
    name: string;

    @IsBoolean()
    is_active?: boolean

    @IsArray()
    @IsString({ each: true })
    permissions: string[];
}