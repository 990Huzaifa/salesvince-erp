import { IsEnum, IsIn } from 'class-validator';
import { PartyType } from 'src/tenant-db/entities/party.entity';

export class ImportPartyDto {
  @IsEnum(PartyType)
  @IsIn([PartyType.CUSTOMER, PartyType.VENDOR])
  type: PartyType;
}
