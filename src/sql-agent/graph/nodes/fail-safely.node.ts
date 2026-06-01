import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createFailSafelyNode() {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    const error =
      state.sqlValidationError ??
      state.executionError ??
      'Unable to complete the database query';

    return {
      status: 'failed',
      answer:
        'I could not safely answer this question from the available database schema. Please try rephrasing your question.',
      executionError: error,
    };
  };
}
