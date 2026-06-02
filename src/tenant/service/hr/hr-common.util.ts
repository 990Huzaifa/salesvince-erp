import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityTarget, IsNull, ObjectLiteral } from 'typeorm';

export function assertBusinessId(businessId?: string): string {
  if (!businessId) {
    throw new BadRequestException('Business context is required');
  }
  return businessId;
}

export function slugifyCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return date;
}

export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildFullName(
  firstName: string,
  lastName?: string | null,
): string {
  return [firstName.trim(), lastName?.trim()].filter(Boolean).join(' ');
}

export async function assertUniqueField<T extends ObjectLiteral>(
  tenantDb: DataSource,
  entity: EntityTarget<T>,
  alias: string,
  businessId: string,
  field: string,
  value: string,
  excludeId?: string,
  entityLabel = 'Record',
): Promise<void> {
  const repo = tenantDb.getRepository(entity);
  const qb = repo
    .createQueryBuilder(alias)
    .where(`${alias}.businessId = :businessId`, { businessId })
    .andWhere(`LOWER(${alias}.${field}) = LOWER(:value)`, { value })
    .andWhere(`${alias}.deletedAt IS NULL`);

  if (excludeId) {
    qb.andWhere(`${alias}.id != :excludeId`, { excludeId });
  }

  const existing = await qb.getOne();
  if (existing) {
    throw new ConflictException(`${entityLabel} with this ${field} already exists`);
  }
}

export async function generateSequentialCode(
  tenantDb: DataSource,
  entity: EntityTarget<ObjectLiteral>,
  alias: string,
  column: string,
  prefix: string,
  padLength = 5,
): Promise<string> {
  const repo = tenantDb.getRepository(entity);
  const last = await repo
    .createQueryBuilder(alias)
    .where(`${alias}.${column} LIKE :prefix`, { prefix: `${prefix}-%` })
    .orderBy(`${alias}.${column}`, 'DESC')
    .getOne();

  let next = 1;
  if (last && typeof (last as Record<string, unknown>)[column] === 'string') {
    const current = (last as Record<string, string>)[column];
    const suffix = current.replace(`${prefix}-`, '');
    next = (parseInt(suffix, 10) || 0) + 1;
  }

  return `${prefix}-${String(next).padStart(padLength, '0')}`;
}

export { IsNull };
