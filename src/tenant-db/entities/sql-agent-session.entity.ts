import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SqlAgentMessage } from './sql-agent-message.entity';

@Entity({ name: 'sql_agent_sessions' })
export class SqlAgentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @OneToMany(() => SqlAgentMessage, (message) => message.session)
  messages: SqlAgentMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
