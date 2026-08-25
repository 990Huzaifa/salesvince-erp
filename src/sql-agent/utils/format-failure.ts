/**
 * Builds a clear, debug-friendly failure message for SQL agent clients.
 */
export function formatSqlAgentFailure(reason: string, stage?: string): string {
  const cleaned = reason?.trim() || 'Unknown error';
  const stageLabel = stage?.trim() ? ` [${stage.trim()}]` : '';
  return `SQL agent could not complete this request${stageLabel}.\n\nReason: ${cleaned}`;
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
