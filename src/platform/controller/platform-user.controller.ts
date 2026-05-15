import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PlatformUserService } from "../services/platform-user.service";
import { CreateRoleDto } from "../dto/role/create-role.dto";
import { UpdateRoleDto } from "../dto/role/update-role.dto";
import { CreatePlatformUserDto } from "../dto/create-platform-user.dto";
import { PermissionGuard } from "src/auth/permission.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RequirePermissions } from "src/auth/require-permission.decorator";
import { CurrentPlatformUser } from "src/auth/current-platform-user.decorator";

@Controller('platform')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PlatformUserController {
    constructor(
        private readonly platformUserService: PlatformUserService
    ) { }


    // PERMISSIONS
    @Get('permissions')
    async getPermissionList(@CurrentPlatformUser() user: any){
        return this.platformUserService.getPlatformPermissionList(user);
    }

    @Post('permissions/create')
    async createPermission(@Body() perData: any, @CurrentPlatformUser() user: any){
        return this.platformUserService.createPlatformPermission(perData, user);
    }


    // ROlES
    @RequirePermissions('ROLE_LIST')
    @Get('roles')
    async getRoleList(@CurrentPlatformUser() user: any){
        return this.platformUserService.getPlatformRoleList(user);
    }

    @RequirePermissions('ROLE_VIEW')
    @Get('roles/:id')
    async getRoleById(@Param('id') id: string, @CurrentPlatformUser() user: any){
        return this.platformUserService.getPlatformRole(id, user);
    }

    @RequirePermissions('ROLE_CREATE')
    @Post('roles/create')
    async createRole(@Body() roleData: CreateRoleDto, @CurrentPlatformUser() user: any){
        return this.platformUserService.createPlatformRole(roleData, user);
    }

    // @RequirePermissions('ROLE_UPDATE')
    @Post('roles/update/:id')
    async updateRole(@Param('id') id: string,@Body() roleData: UpdateRoleDto, @CurrentPlatformUser() user: any){
        return this.platformUserService.updatePlatformRole(id, {...roleData}, user);
    }


    // USERS

    @RequirePermissions('USER_LIST')
    @Get('users')
    async getUserList(@CurrentPlatformUser() user: any){
        return this.platformUserService.getPlatformUserList(user);
    }

    @RequirePermissions('USER_VIEW')
    @Get('users/:id')
    async getUserById(@Param('id') id: string, @CurrentPlatformUser() user: any){
        return this.platformUserService.getPlatformUser(id, user);
    }

    @RequirePermissions('USER_CREATE')
    @Post('users/create')
    async createUser(@Body() userData: CreatePlatformUserDto, @CurrentPlatformUser() user: any){
        return this.platformUserService.createPlatformUser(userData, user);
    }

    @Post('users/change-password')
    async changePassword(@Body() data: { password: string }, @CurrentPlatformUser() user: any){
        return this.platformUserService.changePlatformUserPassword(data.password, user);
    }
}