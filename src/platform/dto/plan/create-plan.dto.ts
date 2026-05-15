import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BillingCycle } from 'src/master-db/entities/plan.entity';
import { PlanLimitDto } from './plan-limit.dto';

export class CreatePlanDto {
    
    @IsString()
    title?: string;

    @IsString()
    slug?: string;

    @IsString()
    @IsOptional()
    stripe_price_id?: string;

    @IsString()
    @IsOptional()
    payfast_price_id?: string;

    @IsString()
    description?: string;

    @IsString()
    currency?: string;

    @IsNumber()
    price: string;

    @IsEnum(BillingCycle)
    billing_cycle: BillingCycle;

    @IsBoolean()
    is_active?: boolean;

    @IsBoolean()
    is_display?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanLimitDto)
    plan_limits?: PlanLimitDto[];

}
