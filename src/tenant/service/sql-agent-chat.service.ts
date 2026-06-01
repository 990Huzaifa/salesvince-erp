import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SqlAgentService } from 'src/sql-agent/sql-agent.service';
import { SqlAgentSession } from 'src/tenant-db/entities/sql-agent-session.entity';
import {
  SqlAgentMessage,
  SqlAgentMessageRole,
  SqlAgentMessageStatus,
} from 'src/tenant-db/entities/sql-agent-message.entity';
import { CreateSqlAgentSessionDto } from '../dto/sql-agent/create-sql-agent-session.dto';
import { SendSqlAgentMessageDto } from '../dto/sql-agent/send-sql-agent-message.dto';

const CONVERSATION_CONTEXT_LIMIT = 12;

@Injectable()
export class SqlAgentChatService {
  constructor(private readonly sqlAgentService: SqlAgentService) {}

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

  async sendMessage(
    tenantDb: DataSource,
    tenantId: string,
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

    const agentResult = await this.sqlAgentService.chat({
      tenantId,
      message: contextualMessage,
      businessId,
      debug: dto.debug ?? false,
    });

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

    return {
      sessionId: session.id,
      userMessage,
      assistantMessage,
      answer: agentResult.answer,
      status: agentResult.status,
      sql: dto.debug ? agentResult.sql : undefined,
      rows: dto.debug ? agentResult.rows : undefined,
      error: agentResult.error ?? null,
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
