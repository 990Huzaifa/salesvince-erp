import { IsEnum, IsNumber } from 'class-validator';
import { LIMIT_KEY } from 'src/master-db/entities/plan.entity';

export class PlanLimitDto {
    @IsEnum(LIMIT_KEY)
    limitKey: LIMIT_KEY;

    @IsNumber()
    limitValue: number;
}
