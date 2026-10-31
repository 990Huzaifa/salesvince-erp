const DEFAULT_TIME_ZONE = 'Asia/Karachi';

const PRIVATE_IP_PATTERN =
  /^(?:::1|::ffff:)?(?:127\.|10\.|192\.168\.|169\.254\.|0\.|localhost)/i;

type RequestLike = {
  ip?: string;
  ips?: string[];
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
};

const firstHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

/** Best-effort client IP from Express / proxy headers. */
export function getClientIp(req?: RequestLike | null): string | undefined {
  if (!req) return undefined;

  const forwarded = firstHeaderValue(req.headers?.['x-forwarded-for']);
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.replace(/^::ffff:/i, '');
  }

  const realIp = firstHeaderValue(req.headers?.['x-real-ip'])?.trim();
  if (realIp) return realIp.replace(/^::ffff:/i, '');

  const candidate = (req.ips?.[0] || req.ip || req.socket?.remoteAddress || '')
    .trim()
    .replace(/^::ffff:/i, '');
  return candidate || undefined;
}

const isPrivateOrLocalIp = (ip: string): boolean =>
  !ip || PRIVATE_IP_PATTERN.test(ip) || ip === '::' || ip === '0:0:0:0:0:0:0:1';

/**
 * Resolve IANA timezone from public request IP.
 * Falls back to Asia/Karachi for private IPs / lookup failures.
 */
export async function resolveTimezoneFromIp(
  ip?: string | null,
  fallback: string = DEFAULT_TIME_ZONE,
): Promise<string> {
  const normalized = String(ip || '')
    .trim()
    .replace(/^::ffff:/i, '');
  if (!normalized || isPrivateOrLocalIp(normalized)) {
    return fallback;
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,timezone`,
      { signal: AbortSignal.timeout(2500) },
    );
    if (!response.ok) return fallback;
    const payload = (await response.json()) as {
      status?: string;
      timezone?: string;
    };
    const timeZone = payload.timezone?.trim();
    if (payload.status === 'success' && timeZone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return timeZone;
      } catch {
        return fallback;
      }
    }
  } catch {
    // ignore network / timeout errors
  }

  return fallback;
}

export { DEFAULT_TIME_ZONE as DEFAULT_PDF_TIME_ZONE };
