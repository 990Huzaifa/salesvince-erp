import { SchemaReaderService } from '../../services/schema-reader.service';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createLoadSchemaNode(schemaReader: SchemaReaderService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.dbConfig) {
      return {
        status: 'failed',
        answer: 'Could not load database schema.',
      };
    }

    try {
      const { schemaText, allTables } = await schemaReader.readSchema(
        state.dbConfig,
      );
      return { schemaText, allTables };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown schema error';
      return {
        status: 'failed',
        answer: 'Could not load database schema.',
        executionError: message,
      };
    }
  };
}
