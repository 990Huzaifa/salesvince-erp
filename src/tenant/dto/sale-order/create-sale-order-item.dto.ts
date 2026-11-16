import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateBy,
  ValidateIf,
  ValidationArguments,
} from 'class-validator';
import {
  SaleItemType,
  isProductSaleItem,
  isServiceSaleItem,
} from 'src/tenant-db/entities/sale-item-type';

type SaleLinePayload = {
  itemType?: SaleItemType;
  serviceId?: unknown;
  productId?: unknown;
  warehouseId?: unknown;
  uomId?: unknown;
  productFlavourId?: unknown;
};

const isBlank = (value: unknown) =>
  value === undefined || value === null || value === '';

/** SERVICE lines must not carry product fields; PRODUCT lines must not carry serviceId. */
function ValidateSaleItemTypeFields() {
  return ValidateBy({
    name: 'validateSaleItemTypeFields',
    validator: {
      validate: (_value: unknown, args?: ValidationArguments) => {
        const line = (args?.object ?? {}) as SaleLinePayload;
        if (isServiceSaleItem(line)) {
          return (
            isBlank(line.productId) &&
            isBlank(line.warehouseId) &&
            isBlank(line.uomId) &&
            isBlank(line.productFlavourId)
          );
        }
        return isBlank(line.serviceId);
      },
      defaultMessage: (args?: ValidationArguments) => {
        const line = (args?.object ?? {}) as SaleLinePayload;
        return isServiceSaleItem(line)
          ? 'SERVICE items must not include productId, warehouseId, uomId or productFlavourId'
          : 'PRODUCT items must not include serviceId';
      },
    },
  });
}

const whenProduct = (line: SaleLinePayload) => isProductSaleItem(line);
const whenService = (line: SaleLinePayload) => isServiceSaleItem(line);

export class CreateSaleOrderItemDto {
  /** Defaults to PRODUCT when omitted. */
  @IsOptional()
  @IsEnum(SaleItemType)
  @ValidateSaleItemTypeFields()
  itemType?: SaleItemType;

  @ValidateIf(whenService)
  @IsUUID()
  serviceId?: string;

  @ValidateIf(whenProduct)
  @IsUUID()
  warehouseId?: string;

  @ValidateIf(whenProduct)
  @IsUUID()
  productId?: string;

  @ValidateIf(whenProduct)
  @IsUUID()
  uomId?: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saleUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;
}
