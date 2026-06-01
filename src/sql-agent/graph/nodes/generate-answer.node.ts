import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AiModelService } from '../../services/ai-model.service';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createGenerateAnswerNode(aiModelService: AiModelService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    const model = aiModelService.getAnswerModel();
    const rowsJson = JSON.stringify(state.rows ?? [], null, 2);

    const response = await model.invoke([
      new SystemMessage(
        `You are a business assistant. Answer clearly using the query results.
If there is no data, say so. Do not invent numbers not present in the rows.`,
      ),
      new HumanMessage(
        `Question: ${state.question}\nSQL: ${state.validatedSql}\nRows: ${rowsJson}`,
      ),
    ]);

    return {
      answer: String(response.content ?? '').trim(),
      status: 'success',
    };
  };
}
