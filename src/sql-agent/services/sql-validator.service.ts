import { Injectable } from '@nestjs/common';
import { extractSql } from '../utils/extract-sql';

const BLOCKED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'MERGE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'CALL',
];

@Injectable()
export class SqlValidatorService {
  validate(sql: string): { valid: boolean; sql?: string; error?: string } {
    const trimmed = extractSql(sql);
    if (!trimmed) {
      return { valid: false, error: 'SQL is empty' };
    }

    if (trimmed.includes(';')) {
      return { valid: false, error: 'Multiple statements are not allowed' };
    }

    if (/--|\/\*/.test(trimmed)) {
      return { valid: false, error: 'SQL comments are not allowed' };
    }

    const upper = trimmed.toUpperCase();
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
      return {
        valid: false,
        error: 'Only SELECT or WITH queries are allowed',
      };
    }

    if (this.hasUnbalancedQuotes(trimmed)) {
      return {
        valid: false,
        error:
          'SQL appears truncated (unbalanced quotes). Regenerate a complete query.',
      };
    }

    for (const keyword of BLOCKED_KEYWORDS) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(trimmed)) {
        return { valid: false, error: `Blocked keyword: ${keyword}` };
      }
    }

    const withLimit = this.ensureLimit(trimmed);
    return { valid: true, sql: withLimit };
  }

  /** Detects model output cut mid-string (e.g. unfinished UUID literals). */
  private hasUnbalancedQuotes(sql: string): boolean {
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      const next = sql[i + 1];

      if (!inDouble && ch === "'") {
        // Postgres escaped single quote: ''
        if (inSingle && next === "'") {
          i += 1;
          continue;
        }
        inSingle = !inSingle;
        continue;
      }

      if (!inSingle && ch === '"') {
        inDouble = !inDouble;
      }
    }

    return inSingle || inDouble;
  }

  private ensureLimit(sql: string): string {
    if (/\bLIMIT\s+\d+/i.test(sql)) {
      return sql;
    }

    const upper = sql.toUpperCase();
    const aggregateOnly =
      /\bCOUNT\s*\(/i.test(upper) ||
      /\bSUM\s*\(/i.test(upper) ||
      /\bAVG\s*\(/i.test(upper) ||
      /\bMIN\s*\(/i.test(upper) ||
      /\bMAX\s*\(/i.test(upper);

    if (aggregateOnly && !/\bGROUP\s+BY\b/i.test(upper)) {
      return sql;
    }

    return `${sql} LIMIT 50`;
  }
}
