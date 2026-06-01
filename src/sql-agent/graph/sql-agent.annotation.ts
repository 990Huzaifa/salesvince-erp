import { Annotation } from '@langchain/langgraph';
import { DbType, TenantDbConnectionConfig } from '../types/db-connection.types';
import { SqlAgentStatus } from './sql-agent.state';

export const SqlAgentAnnotation = Annotation.Root({
  question: Annotation<string>,
  businessId: Annotation<string | null>,
  dbConfig: Annotation<TenantDbConnectionConfig | null>,
  dbType: Annotation<DbType | null>,
  schemaText: Annotation<string | null>,
  allTables: Annotation<string[]>,
  selectedTables: Annotation<string[]>,
  generatedSql: Annotation<string | null>,
  validatedSql: Annotation<string | null>,
  sqlValidationError: Annotation<string | null>,
  rows: Annotation<Record<string, unknown>[] | null>,
  rowCount: Annotation<number>,
  executionError: Annotation<string | null>,
  answer: Annotation<string | null>,
  status: Annotation<SqlAgentStatus>,
  retryCount: Annotation<number>,
  maxRetries: Annotation<number>,
});
