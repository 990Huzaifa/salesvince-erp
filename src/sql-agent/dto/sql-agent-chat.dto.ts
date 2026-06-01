import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SqlAgentChatDto {
  @IsString()
  @MinLength(2)
  message: string;

  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}
