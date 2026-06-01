import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createLoadConnectionNode() {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.dbConfig) {
      return {
        status: 'failed',
        answer:
          'Database connection is not configured for this tenant.',
      };
    }

    return {
      dbConfig: state.dbConfig,
      dbType: state.dbConfig.dbType,
    };
  };
}
