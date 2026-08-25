/**
 * Extracts a single PostgreSQL read query from model output.
 * Handles ```sql fences, plain text, and prose before/after the query.
 */
export function extractSql(text: string): string {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return '';
  }

  const fenced =
    raw.match(/```sql\s*([\s\S]*?)```/i) ??
    raw.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return normalizeExtractedSql(fenced[1]);
  }

  const statement = findReadQueryStatement(raw);
  if (statement) {
    return normalizeExtractedSql(statement);
  }

  return normalizeExtractedSql(raw);
}

function findReadQueryStatement(text: string): string | null {
  const withMatch = text.match(/\bWITH\b[\s\S]*/i);
  const selectMatch = text.match(/\bSELECT\b[\s\S]*/i);

  let candidate: string | null = null;
  if (withMatch && selectMatch) {
    const withIndex = withMatch.index ?? -1;
    const selectIndex = selectMatch.index ?? -1;
    if (withIndex >= 0 && (selectIndex < 0 || withIndex <= selectIndex)) {
      candidate = withMatch[0];
    } else {
      candidate = selectMatch[0];
    }
  } else {
    candidate = withMatch?.[0] ?? selectMatch?.[0] ?? null;
  }

  if (!candidate) {
    return null;
  }

  // Drop trailing explanation paragraphs after the SQL block.
  return candidate.split(/\n\s*\n/)[0]?.trim() ?? null;
}

function normalizeExtractedSql(sql: string): string {
  let cleaned = sql.trim();

  // Drop trailing prose after the query ends.
  cleaned = cleaned.replace(/\s+```[\s\S]*$/i, '').trim();

  // Remove a single trailing semicolon (multi-statement still blocked in validator).
  cleaned = cleaned.replace(/;\s*$/, '').trim();

  return cleaned;
}
