import { memoryStorage } from 'multer';
import { ASSET_RULES, AssetPurpose } from './asset-rules.config';

const productImageRules = ASSET_RULES[AssetPurpose.PRODUCT_IMAGE];

export const productImageUploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: productImageRules.maxSizeBytes,
    files: 1,
  },
};
