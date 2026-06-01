import { SqlValidatorService } from '../../services/sql-validator.service';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createValidateSqlNode(sqlValidator: SqlValidatorService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.generatedSql) {
      return {
        sqlValidationError: 'No SQL was generated',
        validatedSql: null,
      };
    }

    const result = sqlValidator.validate(state.generatedSql);
    if (!result.valid) {
      return {
        validatedSql: null,
        sqlValidationError: result.error ?? 'SQL validation failed',
      };
    }

    return {
      validatedSql: result.sql ?? state.generatedSql,
      sqlValidationError: null,
    };
  };
}
