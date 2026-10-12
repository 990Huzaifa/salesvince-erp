import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import type { Options } from 'multer';

/** Large master-data JSON packs (parties/products export files). */
export const JSON_IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export const jsonImportUploadOptions: Options = {
  storage: memoryStorage(),
  limits: {
    fileSize: JSON_IMPORT_MAX_FILE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    const name = file.originalname?.toLowerCase() ?? '';
    const mime = file.mimetype?.toLowerCase() ?? '';
    const ok =
      name.endsWith('.json') ||
      mime === 'application/json' ||
      mime === 'application/octet-stream' ||
      mime === 'text/plain';
    if (!ok) {
      callback(
        new BadRequestException('Only .json files are supported for JSON import') as any,
        false,
      );
      return;
    }
    callback(null, true);
  },
};
