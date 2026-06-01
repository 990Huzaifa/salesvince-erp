import { Injectable, Logger } from '@nestjs/common';
import { TenantDbConnectionAdapter } from './adapters/tenant-db-connection.adapter';
import { buildSqlAgentGraph } from './graph/sql-agent.graph';
import {
  createInitialSqlAgentState,
  SqlAgentState,
} from './graph/sql-agent.state';
import { AiModelService } from './services/ai-model.service';
import { QueryExecutorService } from './services/query-executor.service';
import { SchemaReaderService } from './services/schema-reader.service';
import { SqlValidatorService } from './services/sql-validator.service';
import { TenantDbConnectionConfig } from './types/db-connection.types';

export type SqlAgentChatInput = {
  tenantId: string;
  message: string;
  businessId?: string | null;
  debug?: boolean;
  dbConfig?: TenantDbConnectionConfig;
};

export type SqlAgentChatResult = {
  status: 'success' | 'failed';
  answer: string;
  sql?: string | null;
  rows?: Record<string, unknown>[] | null;
  selectedTables?: string[];
  error?: string | null;
  debug?: Record<string, unknown>;
};

@Injectable()
export class SqlAgentService {
  private readonly logger = new Logger(SqlAgentService.name);
  private compiledGraph: ReturnType<typeof buildSqlAgentGraph> | null = null;

  constructor(
    private readonly aiModelService: AiModelService,
    private readonly schemaReaderService: SchemaReaderService,
    private readonly sqlValidatorService: SqlValidatorService,
    private readonly queryExecutorService: QueryExecutorService,
    private readonly tenantDbConnectionAdapter: TenantDbConnectionAdapter,
  ) {}

  private getGraph() {
    if (!this.compiledGraph) {
      this.compiledGraph = buildSqlAgentGraph({
        aiModelService: this.aiModelService,
        schemaReaderService: this.schemaReaderService,
        sqlValidatorService: this.sqlValidatorService,
        queryExecutorService: this.queryExecutorService,
      });
    }
    return this.compiledGraph;
  }

  async chat(input: SqlAgentChatInput): Promise<SqlAgentChatResult> {
    try {
      const dbConfig =
        input.dbConfig ??
        (await this.tenantDbConnectionAdapter.getConnectionConfig(
          input.tenantId,
        ));

      const initialState = createInitialSqlAgentState({
        question: input.message,
        dbConfig,
        businessId: input.businessId,
      });

      const finalState = (await this.getGraph().invoke(
        initialState as unknown as Record<string, unknown>,
      )) as SqlAgentState;

      return this.toChatResult(finalState, input.debug ?? false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SQL agent failed';
      this.logger.error(message, error instanceof Error ? error.stack : undefined);
      return {
        status: 'failed',
        answer:
          'I could not safely answer this question from the available database schema. Please try again later.',
        error: message,
      };
    }
  }

  private toChatResult(
    state: SqlAgentState,
    debug: boolean,
  ): SqlAgentChatResult {
    const status = state.status === 'success' ? 'success' : 'failed';
    const base: SqlAgentChatResult = {
      status,
      answer:
        state.answer ??
        'I could not safely answer this question from the available database schema.',
      error: state.sqlValidationError ?? state.executionError ?? null,
    };

    if (!debug) {
      return base;
    }

    return {
      ...base,
      sql: state.validatedSql ?? state.generatedSql,
      rows: state.rows,
      selectedTables: state.selectedTables,
      debug: {
        dbType: state.dbType,
        selectedTables: state.selectedTables,
        generatedSql: state.generatedSql,
        validatedSql: state.validatedSql,
        retryCount: state.retryCount,
        rowCount: state.rowCount,
      },
    };
  }
}
