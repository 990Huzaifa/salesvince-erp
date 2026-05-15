import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsDateString,
} from 'class-validator';

import {
    BillingModel,
    PaymentMode,
    CollectionType,
    Status,
} from '../../../master-db/entities/subscription.entity';

export class CreateSubscriptionDto {

    @IsNumber()
    @IsNotEmpty()
    plan_id: number;

    @IsNotEmpty()
    tenant_id: string;

    @IsEnum(BillingModel)
    billingModel: BillingModel;

    @IsEnum(PaymentMode)
    paymentMode: PaymentMode;

    @IsEnum(CollectionType)
    collectionType: CollectionType;

    @IsEnum(Status)
    status: Status;

    @IsDateString()
    expiresAt: Date;

    @IsOptional()
    @IsDateString()
    cancelledAt?: Date;
}