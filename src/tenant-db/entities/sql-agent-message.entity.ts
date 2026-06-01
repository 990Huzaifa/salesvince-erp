import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SqlAgentSession } from './sql-agent-session.entity';

export enum SqlAgentMessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}

export enum SqlAgentMessageStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity({ name: 'sql_agent_messages' })
export class SqlAgentMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SqlAgentSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: SqlAgentSession;

  @Column({ type: 'enum', enum: SqlAgentMessageRole })
  role: SqlAgentMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  sql: string | null;

  @Column({
    type: 'enum',
    enum: SqlAgentMessageStatus,
    nullable: true,
  })
  status: SqlAgentMessageStatus | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
