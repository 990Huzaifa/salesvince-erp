import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';
import { formatSqlAgentFailure } from '../../utils/format-failure';

export function createLoadConnectionNode() {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.dbConfig) {
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(
          'Database connection is not configured for this tenant.',
          'load_connection',
        ),
        executionError: 'Database connection is not configured for this tenant.',
      };
    }

    return {
      dbConfig: state.dbConfig,
      dbType: state.dbConfig.dbType,
    };
  };
}
