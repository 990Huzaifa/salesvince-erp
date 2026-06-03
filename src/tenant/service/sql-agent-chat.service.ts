import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PusherService } from 'src/common/pusher/pusher.service';
import { SqlAgentService } from 'src/sql-agent/sql-agent.service';
import { User } from 'src/tenant-db/entities/user.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
import { SqlAgentSession } from 'src/tenant-db/entities/sql-agent-session.entity';
import {
  SqlAgentMessage,
  SqlAgentMessageRole,
  SqlAgentMessageStatus,
} from 'src/tenant-db/entities/sql-agent-message.entity';
import {
  SQL_AGENT_PUSHER_EVENT,
  SqlAgentPusherPayload,
} from '../constants/sql-agent-pusher.events';
import { buildTenantUserPusherChannel } from '../utils/tenant-pusher-channel';
import { CreateSqlAgentSessionDto } from '../dto/sql-agent/create-sql-agent-session.dto';
import { SendSqlAgentMessageDto } from '../dto/sql-agent/send-sql-agent-message.dto';

const CONVERSATION_CONTEXT_LIMIT = 12;

export type SqlAgentSendMessageContext = {
  tenantId: string;
  tenantCode: string;
  userCode?: string;
  businessCode?: string;
};

@Injectable()
export class SqlAgentChatService {
  private readonly logger = new Logger(SqlAgentChatService.name);

  constructor(
    private readonly sqlAgentService: SqlAgentService,
    private readonly pusherService: PusherService,
  ) {}

  async createSession(
    tenantDb: DataSource,
    userId: string,
    businessId: string,
    dto: CreateSqlAgentSessionDto,
  ) {
    const sessionRepo = tenantDb.getRepository(SqlAgentSession);
    const session = sessionRepo.create({
      userId,
      businessId,
      title: dto.title?.trim() || null,
    });
    const saved = await sessionRepo.save(session);
    return { session: saved };
  }

  async listSessions(
    tenantDb: DataSource,
    userId: string,
    businessId: string,
  ) {
    const sessions = await tenantDb.getRepository(SqlAgentSession).find({
      where: { userId, businessId },
      order: { updatedAt: 'DESC' },
      select: ['id', 'title', 'createdAt', 'updatedAt'],
    });
    return { sessions };
  }

  async getSessionMessages(
    tenantDb: DataSource,
    sessionId: string,
    userId: string,
    businessId: string,
  ) {
    const session = await this.getOwnedSession(
      tenantDb,
      sessionId,
      userId,
      businessId,
    );

    const messages = await tenantDb.getRepository(SqlAgentMessage).find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
      select: ['id', 'role', 'content', 'sql', 'status', 'metadata', 'createdAt'],
    });

    return { session, messages };
  }

  /**
   * Accepts the user message, notifies via Pusher, and processes the agent in the background.
   */
  async sendMessage(
    tenantDb: DataSource,
    context: SqlAgentSendMessageContext,
    sessionId: string,
    userId: string,
    businessId: string,
    dto: SendSqlAgentMessageDto,
  ) {
    const session = await this.getOwnedSession(
      tenantDb,
      sessionId,
      userId,
      businessId,
    );

    const contextualMessage = await this.buildContextualMessage(
      tenantDb,
      session.id,
      dto.message,
    );

    const messageRepo = tenantDb.getRepository(SqlAgentMessage);
    const userMessage = await messageRepo.save(
      messageRepo.create({
        sessionId: session.id,
        role: SqlAgentMessageRole.USER,
        content: dto.message.trim(),
        sql: null,
        status: null,
        metadata: null,
      }),
    );

    const channel = await this.resolvePusherChannel(
      tenantDb,
      context.tenantCode,
      userId,
      businessId,
      context.userCode,
      context.businessCode,
    );

    await this.emitPusherUpdate(channel, {
      sessionId: session.id,
      phase: 'received',
      label: 'Your question was received. Please wait…',
      userMessageId: userMessage.id,
      userMessage: this.serializeMessage(userMessage),
    });

    await this.emitPusherUpdate(channel, {
      sessionId: session.id,
      phase: 'processing',
      label: 'Analyzing your data and preparing an answer…',
      userMessageId: userMessage.id,
    });

    void this.processAgentReply({
      tenantDb,
      context,
      session,
      userMessage,
      businessId,
      dto,
      channel,
      contextualMessage,
    }).catch((error) => {
      this.logger.error(
        `SQL agent background processing failed for session ${session.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      void this.emitPusherUpdate(channel, {
        sessionId: session.id,
        phase: 'failed',
        label: 'Something went wrong while generating the answer.',
        userMessageId: userMessage.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return {
      accepted: true,
      status: 'processing',
      sessionId: session.id,
      userMessage,
      message:
        'Your question is being processed. Listen for sql-agent.update on your tenant user channel.',
    };
  }

  private async processAgentReply(params: {
    tenantDb: DataSource;
    context: SqlAgentSendMessageContext;
    session: SqlAgentSession;
    userMessage: SqlAgentMessage;
    businessId: string;
    dto: SendSqlAgentMessageDto;
    channel: string;
    contextualMessage: string;
  }) {
    const {
      tenantDb,
      context,
      session,
      userMessage,
      businessId,
      dto,
      channel,
      contextualMessage,
    } = params;

    const agentResult = await this.sqlAgentService.chat({
      tenantId: context.tenantId,
      message: contextualMessage,
      businessId,
      debug: dto.debug ?? false,
    });

    const messageRepo = tenantDb.getRepository(SqlAgentMessage);
    const assistantMessage = await messageRepo.save(
      messageRepo.create({
        sessionId: session.id,
        role: SqlAgentMessageRole.ASSISTANT,
        content: agentResult.answer,
        sql: agentResult.sql ?? null,
        status:
          agentResult.status === 'success'
            ? SqlAgentMessageStatus.SUCCESS
            : SqlAgentMessageStatus.FAILED,
        metadata: {
          error: agentResult.error ?? null,
          selectedTables: agentResult.selectedTables ?? null,
          debug: agentResult.debug ?? null,
        },
      }),
    );

    if (!session.title) {
      const title = dto.message.trim().slice(0, 80);
      await tenantDb.getRepository(SqlAgentSession).update(session.id, {
        title,
      });
      session.title = title;
    }

    await tenantDb.getRepository(SqlAgentSession).update(session.id, {
      updatedAt: new Date(),
    });

    const phase = agentResult.status === 'success' ? 'completed' : 'failed';
    const label =
      agentResult.status === 'success'
        ? 'Answer is ready.'
        : 'Could not generate a safe answer.';

    await this.emitPusherUpdate(channel, {
      sessionId: session.id,
      phase,
      label,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      userMessage: this.serializeMessage(userMessage),
      assistantMessage: this.serializeMessage(assistantMessage),
      answer: agentResult.answer,
      status: agentResult.status,
      error: agentResult.error ?? null,
      sql: dto.debug ? agentResult.sql ?? null : null,
      rows: dto.debug ? agentResult.rows ?? null : null,
    });
  }

  private async resolvePusherChannel(
    tenantDb: DataSource,
    tenantCode: string,
    userId: string,
    businessId: string,
    userCode?: string,
    businessCode?: string,
  ): Promise<string> {
    let resolvedUserCode = userCode;
    if (!resolvedUserCode) {
      const row = await tenantDb.getRepository(User).findOne({
        where: { id: userId },
        select: ['code'],
      });
      resolvedUserCode = row?.code;
    }

    if (!resolvedUserCode) {
      throw new NotFoundException('User not found');
    }

    let resolvedBusinessCode = businessCode;
    if (!resolvedBusinessCode && businessId) {
      const row = await tenantDb.getRepository(Business).findOne({
        where: { id: businessId },
        select: ['code'],
      });
      resolvedBusinessCode = row?.code;
    }

    return buildTenantUserPusherChannel(
      tenantCode,
      resolvedUserCode,
      resolvedBusinessCode,
    );
  }

  private async emitPusherUpdate(
    channel: string,
    payload: SqlAgentPusherPayload,
  ): Promise<void> {
    try {
      await this.pusherService.trigger(channel, SQL_AGENT_PUSHER_EVENT, payload);
    } catch (error) {
      this.logger.warn(
        `Pusher trigger failed on ${channel} (${payload.phase}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private serializeMessage(message: SqlAgentMessage): Record<string, unknown> {
    return {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      sql: message.sql,
      status: message.status,
      metadata: message.metadata,
      createdAt: message.createdAt,
    };
  }

  private async getOwnedSession(
    tenantDb: DataSource,
    sessionId: string,
    userId: string,
    businessId: string,
  ): Promise<SqlAgentSession> {
    const session = await tenantDb.getRepository(SqlAgentSession).findOne({
      where: { id: sessionId, userId, businessId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    return session;
  }

  private async buildContextualMessage(
    tenantDb: DataSource,
    sessionId: string,
    currentMessage: string,
  ): Promise<string> {
    const priorMessages = await tenantDb.getRepository(SqlAgentMessage).find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: CONVERSATION_CONTEXT_LIMIT,
      select: ['role', 'content'],
    });

    if (!priorMessages.length) {
      return currentMessage.trim();
    }

    const chronological = [...priorMessages].reverse();
    const history = chronological
      .map((message) => {
        const label =
          message.role === SqlAgentMessageRole.USER ? 'User' : 'Assistant';
        return `${label}: ${message.content}`;
      })
      .join('\n');

    return `Previous conversation:\n${history}\n\nCurrent question: ${currentMessage.trim()}`;
  }
}
