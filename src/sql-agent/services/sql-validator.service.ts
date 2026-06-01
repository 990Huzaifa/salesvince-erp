import { Injectable } from '@nestjs/common';

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
    const trimmed = sql.trim();
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

    for (const keyword of BLOCKED_KEYWORDS) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(trimmed)) {
        return { valid: false, error: `Blocked keyword: ${keyword}` };
      }
    }

    const withLimit = this.ensureLimit(trimmed);
    return { valid: true, sql: withLimit };
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
