import { PartialType } from '@nestjs/mapped-types';
import { CreatePayPolicyDto } from './create-pay-policy.dto';

export class UpdatePayPolicyDto extends PartialType(CreatePayPolicyDto) {}
