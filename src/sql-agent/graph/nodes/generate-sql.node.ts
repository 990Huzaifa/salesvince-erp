import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AiModelService } from '../../services/ai-model.service';
import {
  formatSqlAgentFailure,
  getErrorMessage,
} from '../../utils/format-failure';
import { extractSql } from '../../utils/extract-sql';
import {
  POSTGRES_IDENTIFIER_RULES,
  quoteSchemaIdentifiers,
} from '../../utils/quote-schema-identifiers';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createGenerateSqlNode(aiModelService: AiModelService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    try {
      const model = aiModelService.getSqlModel();
      const businessRule = state.businessId
        ? `When a table has a "businessId" column, you MUST filter with "businessId" = '${state.businessId}'.`
        : '';

      const filteredSchema = state.schemaText ?? '';
      const tables = state.selectedTables.length
        ? state.selectedTables.join(', ')
        : 'all tables';

      const response = await model.invoke([
        new SystemMessage(
          `You write a single PostgreSQL SELECT (or WITH) query.
Return ONLY the SQL query with no explanation or markdown unless wrapped in a single \`\`\`sql block.
Rules: read-only, no semicolons, no comments, one statement only.
${POSTGRES_IDENTIFIER_RULES}
${businessRule}
Relevant tables: ${tables}`,
        ),
        new HumanMessage(
          `Question: ${state.question}\n\nSchema:\n${filteredSchema}`,
        ),
      ]);

      const generatedSql = quoteSchemaIdentifiers(
        extractSql(response.content),
        filteredSchema,
      );
      return {
        generatedSql,
        sqlValidationError: null,
        executionError: null,
        validatedSql: null,
      };
    } catch (error) {
      const message = getErrorMessage(error, 'SQL generation AI call failed');
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(message, 'generate_sql'),
        executionError: message,
        generatedSql: null,
        validatedSql: null,
      };
    }
  };
}
