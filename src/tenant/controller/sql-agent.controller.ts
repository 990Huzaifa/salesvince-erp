import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import {
  TenantCode,
  TenantConnection,
  TenantId,
} from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { CreateSqlAgentSessionDto } from '../dto/sql-agent/create-sql-agent-session.dto';
import { SendSqlAgentMessageDto } from '../dto/sql-agent/send-sql-agent-message.dto';
import { SqlAgentChatService } from '../service/sql-agent-chat.service';

@Controller('tenant/sql-agent')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SqlAgentController {
  constructor(private readonly sqlAgentChatService: SqlAgentChatService) {}

  @Post('sessions')
  @RequirePermissions('USE_SQL_AGENT')
  createSession(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Body() dto: CreateSqlAgentSessionDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.sqlAgentChatService.createSession(
      tenantDb,
      user.userId,
      user.businessId,
      dto,
    );
  }

  @Get('sessions')
  @RequirePermissions('USE_SQL_AGENT')
  listSessions(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.sqlAgentChatService.listSessions(
      tenantDb,
      user.userId,
      user.businessId,
    );
  }

  @Get('sessions/:id/messages')
  @RequirePermissions('USE_SQL_AGENT')
  getSessionMessages(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.sqlAgentChatService.getSessionMessages(
      tenantDb,
      sessionId,
      user.userId,
      user.businessId,
    );
  }

  @Post('sessions/:id/messages')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('USE_SQL_AGENT')
  sendMessage(
    @TenantConnection() tenantDb: DataSource,
    @TenantId() tenantId: string,
    @TenantCode() tenantCode: string,
    @Param('id') sessionId: string,
    @Req() req: Request,
    @Body() dto: SendSqlAgentMessageDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.sqlAgentChatService.sendMessage(
      tenantDb,
      {
        tenantId,
        tenantCode,
        userCode: user.userCode,
        businessCode: user.businessCode,
      },
      sessionId,
      user.userId,
      user.businessId,
      dto,
    );
  }
}
