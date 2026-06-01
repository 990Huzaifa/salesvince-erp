import { END, START, StateGraph } from '@langchain/langgraph';
import { AiModelService } from '../services/ai-model.service';
import { QueryExecutorService } from '../services/query-executor.service';
import { SchemaReaderService } from '../services/schema-reader.service';
import { SqlValidatorService } from '../services/sql-validator.service';
import { SqlAgentAnnotation } from './sql-agent.annotation';
import { createExecuteSqlNode } from './nodes/execute-sql.node';
import { createFailSafelyNode } from './nodes/fail-safely.node';
import { createGenerateAnswerNode } from './nodes/generate-answer.node';
import { createGenerateSqlNode } from './nodes/generate-sql.node';
import { createLoadConnectionNode } from './nodes/load-connection.node';
import { createLoadSchemaNode } from './nodes/load-schema.node';
import { createRepairSqlNode } from './nodes/repair-sql.node';
import { createSelectTablesNode } from './nodes/select-tables.node';
import { createValidateSqlNode } from './nodes/validate-sql.node';
import { SqlAgentState } from './sql-agent.state';

export type SqlAgentGraphDeps = {
  aiModelService: AiModelService;
  schemaReaderService: SchemaReaderService;
  sqlValidatorService: SqlValidatorService;
  queryExecutorService: QueryExecutorService;
};

function routeAfterLoad(state: SqlAgentState): string {
  return state.status === 'failed' ? 'fail_safely' : 'load_schema';
}

function routeAfterSchema(state: SqlAgentState): string {
  return state.status === 'failed' ? 'fail_safely' : 'select_tables';
}

function routeAfterValidate(state: SqlAgentState): string {
  if (state.validatedSql) {
    return 'execute_sql';
  }
  if (state.retryCount < state.maxRetries) {
    return 'repair_sql';
  }
  return 'fail_safely';
}

function routeAfterExecute(state: SqlAgentState): string {
  if (!state.executionError) {
    return 'generate_answer';
  }
  if (state.retryCount < state.maxRetries) {
    return 'repair_sql';
  }
  return 'fail_safely';
}

type RouteFn = (state: SqlAgentState) => string;

export function buildSqlAgentGraph(deps: SqlAgentGraphDeps) {
  const graph = new StateGraph(SqlAgentAnnotation)
    .addNode('load_connection', createLoadConnectionNode() as never)
    .addNode('load_schema', createLoadSchemaNode(deps.schemaReaderService) as never)
    .addNode('select_tables', createSelectTablesNode(deps.aiModelService) as never)
    .addNode('generate_sql', createGenerateSqlNode(deps.aiModelService) as never)
    .addNode('validate_sql', createValidateSqlNode(deps.sqlValidatorService) as never)
    .addNode('execute_sql', createExecuteSqlNode(deps.queryExecutorService) as never)
    .addNode('repair_sql', createRepairSqlNode(deps.aiModelService) as never)
    .addNode('generate_answer', createGenerateAnswerNode(deps.aiModelService) as never)
    .addNode('fail_safely', createFailSafelyNode() as never)
    .addEdge(START, 'load_connection')
    .addConditionalEdges('load_connection', routeAfterLoad as RouteFn as never, [
      'load_schema',
      'fail_safely',
    ])
    .addConditionalEdges('load_schema', routeAfterSchema as RouteFn as never, [
      'select_tables',
      'fail_safely',
    ])
    .addEdge('select_tables', 'generate_sql')
    .addEdge('generate_sql', 'validate_sql')
    .addConditionalEdges('validate_sql', routeAfterValidate as RouteFn as never, [
      'execute_sql',
      'repair_sql',
      'fail_safely',
    ])
    .addConditionalEdges('execute_sql', routeAfterExecute as RouteFn as never, [
      'generate_answer',
      'repair_sql',
      'fail_safely',
    ])
    .addEdge('repair_sql', 'validate_sql')
    .addEdge('generate_answer', END)
    .addEdge('fail_safely', END);

  return graph.compile();
}
