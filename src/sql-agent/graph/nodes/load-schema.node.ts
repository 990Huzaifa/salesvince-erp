import { SchemaReaderService } from '../../services/schema-reader.service';
import {
  formatSqlAgentFailure,
  getErrorMessage,
} from '../../utils/format-failure';
import { SqlAgentState, SqlAgentStateUpdate } from '../sql-agent.state';

export function createLoadSchemaNode(schemaReader: SchemaReaderService) {
  return async (state: SqlAgentState): Promise<SqlAgentStateUpdate> => {
    if (!state.dbConfig) {
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(
          'Could not load database schema because DB config is missing.',
          'load_schema',
        ),
        executionError: 'DB config missing while loading schema',
      };
    }

    try {
      const { schemaText, allTables } = await schemaReader.readSchema(
        state.dbConfig,
      );
      if (!allTables.length) {
        return {
          status: 'failed',
          answer: formatSqlAgentFailure(
            'No tables found in the tenant database schema.',
            'load_schema',
          ),
          executionError: 'No tables found in schema',
          schemaText,
          allTables,
        };
      }
      return { schemaText, allTables };
    } catch (error) {
      const message = getErrorMessage(error, 'Unknown schema error');
      return {
        status: 'failed',
        answer: formatSqlAgentFailure(message, 'load_schema'),
        executionError: message,
      };
    }
  };
}
