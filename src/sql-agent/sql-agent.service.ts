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
import {
  appendSqlToFailureMessage,
  formatSqlAgentFailure,
  getErrorMessage,
} from './utils/format-failure';

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
  failedStage?: string | null;
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
      const message = getErrorMessage(error, 'SQL agent failed');
      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      const stage = this.inferCrashStage(message);
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(message, stage),
        error: message,
        failedStage: stage,
      };
    }
  }

  private inferCrashStage(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('openai') || lower.includes('api key')) {
      return 'ai_model';
    }
    if (lower.includes('tenant db config')) {
      return 'tenant_db_config';
    }
    if (lower.includes('timeout') || lower.includes('econnrefused')) {
      return 'connection';
    }
    return 'unhandled_exception';
  }

  private toChatResult(
    state: SqlAgentState,
    debug: boolean,
  ): SqlAgentChatResult {
    const status = state.status === 'success' ? 'success' : 'failed';
    const reason =
      state.sqlValidationError ?? state.executionError ?? null;
    const sql = state.validatedSql ?? state.generatedSql;
    const stage = this.inferStateStage(state);

    const answer =
      status === 'success'
        ? state.answer ?? 'No answer generated.'
        : appendSqlToFailureMessage(
            state.answer ??
              formatSqlAgentFailure(reason ?? 'Unknown failure', stage, sql),
            sql,
          );

    const base: SqlAgentChatResult = {
      status,
      answer,
      error: reason,
      failedStage: status === 'failed' ? stage : null,
      sql: status === 'failed' ? sql : undefined,
    };

    if (status === 'failed' || debug) {
      return {
        ...base,
        sql,
        rows: debug ? state.rows : undefined,
        selectedTables: state.selectedTables,
        debug: debug
          ? {
              dbType: state.dbType,
              selectedTables: state.selectedTables,
              generatedSql: state.generatedSql,
              validatedSql: state.validatedSql,
              sqlValidationError: state.sqlValidationError,
              executionError: state.executionError,
              retryCount: state.retryCount,
              maxRetries: state.maxRetries,
              rowCount: state.rowCount,
              schemaLoaded: Boolean(state.schemaText),
              tableCount: state.allTables.length,
            }
          : {
              generatedSql: state.generatedSql,
              validatedSql: state.validatedSql,
              retryCount: state.retryCount,
              maxRetries: state.maxRetries,
              schemaLoaded: Boolean(state.schemaText),
              tableCount: state.allTables.length,
            },
      };
    }

    return base;
  }

  private inferStateStage(state: SqlAgentState): string {
    if (!state.dbConfig) {
      return 'load_connection';
    }
    if (!state.schemaText) {
      return 'load_schema';
    }
    if (!state.selectedTables.length && state.status === 'failed') {
      return 'select_tables';
    }
    if (state.sqlValidationError) {
      return 'validate_sql';
    }
    if (state.executionError) {
      return 'execute_sql';
    }
    if (state.generatedSql && !state.answer) {
      return 'generate_answer';
    }
    return 'fail_safely';
  }
}
