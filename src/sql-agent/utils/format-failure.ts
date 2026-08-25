import { stringifySqlForDisplay } from './model-content';

/**
 * Builds a clear, debug-friendly failure message for SQL agent clients.
 */
export function formatSqlAgentFailure(
  reason: string,
  stage?: string,
  sql?: unknown,
): string {
  const cleaned = reason?.trim() || 'Unknown error';
  const stageLabel = stage?.trim() ? ` [${stage.trim()}]` : '';
  const parts = [
    `SQL agent could not complete this request${stageLabel}.`,
    '',
    `Reason: ${cleaned}`,
  ];

  const sqlText = stringifySqlForDisplay(sql);
  if (sqlText) {
    parts.push('', 'SQL:', sqlText);
  } else {
    parts.push('', 'SQL: (none generated)');
  }

  return parts.join('\n');
}

export function appendSqlToFailureMessage(
  answer: string,
  sql?: unknown,
): string {
  if (!answer?.trim()) {
    return formatSqlAgentFailure('Unknown failure', undefined, sql);
  }

  if (/\nSQL:/i.test(answer)) {
    return answer;
  }

  const sqlText = stringifySqlForDisplay(sql);
  if (sqlText) {
    return `${answer.trim()}\n\nSQL:\n${sqlText}`;
  }

  return `${answer.trim()}\n\nSQL: (none generated)`;
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
}
