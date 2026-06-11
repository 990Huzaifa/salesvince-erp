import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export function parseJsonFormField<T extends object>(
  raw: string | undefined,
  dtoClass: new () => T,
  fieldName = 'data',
): T {
  if (!raw?.trim()) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException(`${fieldName} must be valid JSON`);
  }

  const instance = plainToInstance(dtoClass, parsed);
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new BadRequestException(
      messages.length ? messages.join('; ') : `Invalid ${fieldName}`,
    );
  }

  return instance;
}
