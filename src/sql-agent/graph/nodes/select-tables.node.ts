import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AiModelService } from '../../services/ai-model.service';
import {
  formatSqlAgentFailure,
  getErrorMessage,
} from '../../utils/format-failure';
import { normalizeModelContent } from '../../utils/model-content';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createSelectTablesNode(aiModelService: AiModelService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.schemaText) {
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(
          'Schema is not available for table selection.',
          'select_tables',
        ),
        executionError: 'Schema is not available for table selection.',
      };
    }

    try {
      const model = aiModelService.getSqlModel();
      const businessHint = state.businessId
        ? `The current business scope is businessId = '${state.businessId}'. Prefer tables/columns that include businessId when relevant.`
        : '';

      const response = await model.invoke([
        new SystemMessage(
          `You select relevant PostgreSQL tables for a user question.
Return ONLY a JSON array of table names, e.g. ["orders","customers"].
Use only tables from the schema. ${businessHint}`,
        ),
        new HumanMessage(
          `Question: ${state.question}\n\nSchema:\n${state.schemaText}`,
        ),
      ]);

      const content = normalizeModelContent(response.content);
      let selectedTables: string[] = [];

      try {
        const parsed = JSON.parse(content) as unknown;
        if (Array.isArray(parsed)) {
          selectedTables = parsed
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => state.allTables.includes(item));
        }
      } catch {
        selectedTables = state.allTables.slice(0, 8);
      }

      if (!selectedTables.length) {
        selectedTables = state.allTables.slice(0, 8);
      }

      return { selectedTables };
    } catch (error) {
      const message = getErrorMessage(error, 'Table selection AI call failed');
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(message, 'select_tables'),
        executionError: message,
      };
    }
  };
}
