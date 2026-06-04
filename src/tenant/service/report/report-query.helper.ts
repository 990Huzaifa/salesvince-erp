import { BadRequestException } from '@nestjs/common';

export function assertBusinessId(businessId?: string): string {
  if (!businessId) {
    throw new BadRequestException('Business context is required');
  }
  return businessId;
}

export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseDateParam(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return parsed;
}

export function parseDateRange(
  startDateStr?: string,
  endDateStr?: string,
): { startDate?: Date; endDate?: Date } {
  const startDate = startDateStr
    ? parseDateParam(startDateStr, 'startDate')
    : undefined;
  const endDate = endDateStr
    ? parseDateParam(endDateStr, 'endDate')
    : undefined;

  if (startDate && endDate && startDate > endDate) {
    throw new BadRequestException(
      'startDate must be on or before endDate',
    );
  }

  return { startDate, endDate };
}

export function resolvePagination(page?: number, limit?: number) {
  const resolvedPage = Math.max(1, Number(page ?? 1));
  const resolvedLimit = Math.min(100, Math.max(1, Number(limit ?? 25)));
  return {
    page: resolvedPage,
    limit: resolvedLimit,
    skip: (resolvedPage - 1) * resolvedLimit,
  };
}

/** End of day UTC-ish for inclusive date filters on timestamp columns. */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Start of day for date-only columns stored as date. */
export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}
