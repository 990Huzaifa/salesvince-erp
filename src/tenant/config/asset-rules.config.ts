export enum AssetPurpose {
    BUSINESS_LOGO = 'BUSINESS_LOGO',
    USER_AVATAR = 'USER_AVATAR',
    PRODUCT_IMAGE = 'PRODUCT_IMAGE',
    RETAILER_IMAGE = 'RETAILER_IMAGE',
    SHOP_VISIT_IMAGE = 'SHOP_VISIT_IMAGE',
    SHOP_MERCHANDISE_IMAGE = 'SHOP_MERCHANDISE_IMAGE',
}

export enum AssetEntityType {
    BUSINESS = 'BUSINESS',
    USER = 'USER',
    PRODUCT = 'PRODUCT',
    RETAILER = 'RETAILER',
    SHOP_VISIT = 'SHOP_VISIT',
    SHOP_MERCHANDISE = 'SHOP_MERCHANDISE',
}

export const ASSET_RULES = {
    [AssetPurpose.BUSINESS_LOGO]: {
        allowedEntityTypes: [AssetEntityType.BUSINESS],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 2 * 1024 * 1024, // 2MB
        maxFiles: 1,
        folder: 'businesses/logo',
    },

    [AssetPurpose.USER_AVATAR]: {
        allowedEntityTypes: [AssetEntityType.USER],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 2 * 1024 * 1024, // 2MB
        maxFiles: 1,
        folder: 'users/avatar',
    },

    [AssetPurpose.PRODUCT_IMAGE]: {
        allowedEntityTypes: [AssetEntityType.PRODUCT],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024, // 5MB
        maxFiles: 10,
        folder: 'products/images',
    },

    [AssetPurpose.RETAILER_IMAGE]: {
        allowedEntityTypes: [AssetEntityType.RETAILER],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024,
        maxFiles: 5,
        folder: 'retailers/images',
    },

    [AssetPurpose.SHOP_VISIT_IMAGE]: {
        allowedEntityTypes: [AssetEntityType.SHOP_VISIT],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024,
        maxFiles: 10,
        folder: 'shop-visits/images',
    },

    [AssetPurpose.SHOP_MERCHANDISE_IMAGE]: {
        allowedEntityTypes: [AssetEntityType.SHOP_MERCHANDISE],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024,
        maxFiles: 10,
        folder: 'shop-merchandise/images',
    },
} as const;