/**
 * Parses table/column identifiers from schema text produced by SchemaReaderService.
 */
export function parseSchemaIdentifiers(schemaText: string): string[] {
  const identifiers = new Set<string>();

  for (const line of schemaText.split('\n')) {
    const columnMatch = line.match(/^\s+-\s+([^:]+):/);
    if (columnMatch?.[1]) {
      identifiers.add(columnMatch[1].trim());
    }

    const tableMatch = line.match(/^Table:\s+(\S+)/);
    if (tableMatch?.[1]) {
      identifiers.add(tableMatch[1].trim());
    }
  }

  return [...identifiers];
}

/**
 * PostgreSQL folds unquoted identifiers to lowercase.
 * Quote camelCase / mixed-case schema identifiers so they match TypeORM columns.
 */
export function quoteSchemaIdentifiers(
  sql: string,
  schemaText?: string | null,
): string {
  if (!sql.trim() || !schemaText?.trim()) {
    return sql;
  }

  const identifiers = parseSchemaIdentifiers(schemaText).filter((name) =>
    /[A-Z]/.test(name),
  );

  if (!identifiers.length) {
    return sql;
  }

  let result = sql;
  const sorted = [...identifiers].sort((a, b) => b.length - a.length);

  for (const identifier of sorted) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\"])\\b${escaped}\\b(?![\"])`, 'g');
    result = result.replace(pattern, `"${identifier}"`);
  }

  return result;
}

export const POSTGRES_IDENTIFIER_RULES = `PostgreSQL identifier rules:
- Use exact table/column names from the schema.
- Wrap every camelCase or mixed-case identifier in double quotes, e.g. "totalAmount", "businessId", "invoiceDate", "deletedAt".
- Lowercase snake_case names such as sale_invoices may stay unquoted.`;
