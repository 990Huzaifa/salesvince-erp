import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';

export type UploadedFileSnapshot = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export function snapshotUploadedFile(
  file: Express.Multer.File | undefined,
  fieldName = 'file',
): UploadedFileSnapshot | undefined {
  if (!file) {
    return undefined;
  }

  let buffer: Buffer | undefined = file.buffer;
  if (!buffer?.length && file.path) {
    buffer = readFileSync(file.path);
  }

  if (!buffer?.length) {
    throw new BadRequestException(`${fieldName} is empty or could not be read`);
  }

  return {
    buffer: Buffer.from(buffer),
    mimetype: file.mimetype,
    originalname: file.originalname,
    size: file.size || buffer.length,
  };
}

export function resolveUploadedFile(
  files: { file?: Express.Multer.File[]; image?: Express.Multer.File[] } | undefined,
): Express.Multer.File | undefined {
  return files?.file?.[0] ?? files?.image?.[0];
}
