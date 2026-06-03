/** Event on the tenant user private channel (see buildTenantUserPusherChannel). */
export const SQL_AGENT_PUSHER_EVENT = 'sql-agent.update';

export type SqlAgentPusherPhase =
  | 'received'
  | 'processing'
  | 'completed'
  | 'failed';

export type SqlAgentPusherPayload = {
  sessionId: string;
  phase: SqlAgentPusherPhase;
  label: string;
  userMessageId?: string;
  assistantMessageId?: string;
  userMessage?: Record<string, unknown>;
  assistantMessage?: Record<string, unknown>;
  answer?: string;
  status?: 'success' | 'failed';
  error?: string | null;
  sql?: string | null;
  rows?: Record<string, unknown>[] | null;
};
