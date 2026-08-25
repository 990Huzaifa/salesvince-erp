import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AiModelService } from '../../services/ai-model.service';
import {
  formatSqlAgentFailure,
  getErrorMessage,
} from '../../utils/format-failure';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

function extractSql(text: string): string {
  const fenced = text.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

export function createRepairSqlNode(aiModelService: AiModelService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    try {
      const model = aiModelService.getSqlModel();
      const errorMessage =
        state.sqlValidationError ?? state.executionError ?? 'Unknown SQL error';

      const response = await model.invoke([
        new SystemMessage(
          `Fix the PostgreSQL query. Return ONLY the corrected SQL, no explanation.
Rules: single SELECT/WITH, no semicolons, no comments, read-only.`,
        ),
        new HumanMessage(
          `Question: ${state.question}
Previous SQL: ${state.generatedSql ?? state.validatedSql ?? ''}
Error: ${errorMessage}
Schema excerpt:
${state.schemaText ?? ''}`,
        ),
      ]);

      return {
        generatedSql: extractSql(String(response.content ?? '')),
        validatedSql: null,
        sqlValidationError: null,
        executionError: null,
        retryCount: state.retryCount + 1,
      };
    } catch (error) {
      const message = getErrorMessage(error, 'SQL repair AI call failed');
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(message, 'repair_sql'),
        executionError: message,
        retryCount: state.retryCount + 1,
      };
    }
  };
}
