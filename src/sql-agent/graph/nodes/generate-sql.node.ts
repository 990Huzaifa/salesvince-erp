import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AiModelService } from '../../services/ai-model.service';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

function extractSql(text: string): string {
  const fenced = text.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

export function createGenerateSqlNode(aiModelService: AiModelService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    const model = aiModelService.getSqlModel();
    const businessRule = state.businessId
      ? `When a table has a businessId column, you MUST filter with businessId = '${state.businessId}'.`
      : '';

    const filteredSchema = state.schemaText ?? '';
    const tables = state.selectedTables.length
      ? state.selectedTables.join(', ')
      : 'all tables';

    const response = await model.invoke([
      new SystemMessage(
        `You write a single PostgreSQL SELECT (or WITH) query.
Rules: read-only, no semicolons, no comments, one statement only.
${businessRule}
Relevant tables: ${tables}`,
      ),
      new HumanMessage(
        `Question: ${state.question}\n\nSchema:\n${filteredSchema}`,
      ),
    ]);

    const generatedSql = extractSql(String(response.content ?? ''));
    return {
      generatedSql,
      sqlValidationError: null,
      executionError: null,
      validatedSql: null,
    };
  };
}
