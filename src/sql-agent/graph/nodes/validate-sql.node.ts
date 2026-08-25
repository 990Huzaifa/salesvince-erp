import { SqlValidatorService } from '../../services/sql-validator.service';
import { quoteSchemaIdentifiers } from '../../utils/quote-schema-identifiers';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createValidateSqlNode(sqlValidator: SqlValidatorService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.generatedSql) {
      return {
        sqlValidationError: 'No SQL was generated',
        validatedSql: null,
      };
    }

    const normalizedSql = quoteSchemaIdentifiers(
      state.generatedSql,
      state.schemaText,
    );

    const result = sqlValidator.validate(normalizedSql);
    if (!result.valid) {
      return {
        validatedSql: null,
        sqlValidationError: result.error ?? 'SQL validation failed',
        generatedSql: normalizedSql,
      };
    }

    return {
      validatedSql: result.sql ?? normalizedSql,
      generatedSql: normalizedSql,
      sqlValidationError: null,
    };
  };
}
