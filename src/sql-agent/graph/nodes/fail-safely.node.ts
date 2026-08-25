import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';
import { formatSqlAgentFailure } from '../../utils/format-failure';

export function createFailSafelyNode() {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    const error =
      state.sqlValidationError ??
      state.executionError ??
      'Unable to complete the database query';

    // Keep stage-specific answers already produced by earlier nodes.
    if (state.answer?.includes('Reason:')) {
      return {
        status: 'failed',
        answer: state.answer,
        executionError: error,
      };
    }

    let stage = 'fail_safely';
    if (!state.dbConfig) {
      stage = 'load_connection';
    } else if (!state.schemaText) {
      stage = 'load_schema';
    } else if (state.sqlValidationError) {
      stage = 'validate_sql';
    } else if (state.executionError && state.validatedSql) {
      stage = 'execute_sql';
    } else if (state.executionError) {
      stage = 'pipeline';
    }

    return {
      status: 'failed',
      answer: formatSqlAgentFailure(error, stage),
      executionError: error,
    };
  };
}
