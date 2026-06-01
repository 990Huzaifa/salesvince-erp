import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSqlAgentSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
