import { QueryExecutorService } from '../../services/query-executor.service';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createExecuteSqlNode(queryExecutor: QueryExecutorService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.dbConfig || !state.validatedSql) {
      return {
        executionError: 'Validated SQL or DB config is missing',
        rows: null,
        rowCount: 0,
      };
    }

    try {
      const { rows, rowCount } = await queryExecutor.execute(
        state.dbConfig,
        state.validatedSql,
      );
      return {
        rows,
        rowCount,
        executionError: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Query execution failed';
      return {
        executionError: message,
        rows: null,
        rowCount: 0,
      };
    }
  };
}
