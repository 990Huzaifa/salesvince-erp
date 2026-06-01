import {
  DbType,
  TenantDbConnectionConfig,
} from '../types/db-connection.types';

export type SqlAgentStatus = 'pending' | 'success' | 'failed';

export interface SqlAgentState {
  question: string;
  businessId?: string | null;
  dbConfig: TenantDbConnectionConfig | null;
  dbType: DbType | null;
  schemaText: string | null;
  allTables: string[];
  selectedTables: string[];
  generatedSql: string | null;
  validatedSql: string | null;
  sqlValidationError: string | null;
  rows: Record<string, unknown>[] | null;
  rowCount: number;
  executionError: string | null;
  answer: string | null;
  status: SqlAgentStatus;
  retryCount: number;
  maxRetries: number;
}

export function createInitialSqlAgentState(input: {
  question: string;
  dbConfig: TenantDbConnectionConfig;
  businessId?: string | null;
  maxRetries?: number;
}): SqlAgentState {
  return {
    question: input.question.trim(),
    businessId: input.businessId ?? null,
    dbConfig: input.dbConfig,
    dbType: input.dbConfig.dbType,
    schemaText: null,
    allTables: [],
    selectedTables: [],
    generatedSql: null,
    validatedSql: null,
    sqlValidationError: null,
    rows: null,
    rowCount: 0,
    executionError: null,
    answer: null,
    status: 'pending',
    retryCount: 0,
    maxRetries: input.maxRetries ?? 2,
  };
}

export type SqlAgentStateUpdate = Partial<SqlAgentState>;
