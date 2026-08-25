type ContentPart = {
  type?: string;
  text?: string;
  content?: string;
  value?: string;
};

/**
 * Normalizes LangChain / OpenAI Responses API message content to plain text.
 */
export function normalizeModelContent(content: unknown): string {
  if (content == null) {
    return '';
  }

  if (typeof content === 'string') {
    return content.trim();
  }

  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => normalizeModelContent(part))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof content === 'object') {
    const part = content as ContentPart & Record<string, unknown>;

    if (typeof part.text === 'string') {
      return part.text.trim();
    }
    if (typeof part.content === 'string') {
      return part.content.trim();
    }
    if (typeof part.value === 'string') {
      return part.value.trim();
    }
    if (typeof part.output_text === 'string') {
      return part.output_text.trim();
    }

    // Some response payloads nest text deeper.
    if (part.message && typeof part.message === 'object') {
      const nested = normalizeModelContent(part.message);
      if (nested) {
        return nested;
      }
    }
  }

  return '';
}

/**
 * Ensures SQL/debug fields are always a readable string.
 */
export function stringifySqlForDisplay(sql: unknown): string | null {
  if (sql == null) {
    return null;
  }
  if (typeof sql === 'string') {
    const trimmed = sql.trim();
    return trimmed || null;
  }
  const normalized = normalizeModelContent(sql);
  return normalized || null;
}
