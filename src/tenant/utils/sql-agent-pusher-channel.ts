const CHANNEL_PREFIX = 'private-tenant-';
const SESSION_MARKER = '-sql-agent-session-';

/** Private Pusher channel scoped to one SQL agent chat session. */
export function buildSqlAgentSessionPusherChannel(
  tenantCode: string,
  sessionId: string,
): string {
  return `${CHANNEL_PREFIX}${tenantCode}${SESSION_MARKER}${sessionId}`;
}

export function parseSqlAgentSessionPusherChannel(
  channel: string,
): { tenantCode: string; sessionId: string } | null {
  if (!channel?.startsWith(CHANNEL_PREFIX)) {
    return null;
  }

  const markerIndex = channel.indexOf(SESSION_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const tenantCode = channel.slice(CHANNEL_PREFIX.length, markerIndex);
  const sessionId = channel.slice(markerIndex + SESSION_MARKER.length);

  if (!tenantCode?.trim() || !sessionId?.trim()) {
    return null;
  }

  return { tenantCode, sessionId };
}

export function isSqlAgentSessionPusherChannel(channel: string): boolean {
  return parseSqlAgentSessionPusherChannel(channel) !== null;
}
