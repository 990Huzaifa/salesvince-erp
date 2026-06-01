import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SendSqlAgentMessageDto {
  @IsString()
  @MinLength(2)
  message: string;

  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}
