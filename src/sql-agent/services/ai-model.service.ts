import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class AiModelService {
  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string {
    const key = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is missing in .env');
    }
    return key;
  }

  private getModelName(): string {
    return (
      this.configService.get<string>('SQL_AGENT_MODEL')?.trim() ||
      'gpt-4.1-mini'
    );
  }

  getSqlModel(): ChatOpenAI {
    return new ChatOpenAI({
      apiKey: this.getApiKey(),
      model: this.getModelName(),
      temperature: 0,
    });
  }

  getAnswerModel(): ChatOpenAI {
    return new ChatOpenAI({
      apiKey: this.getApiKey(),
      model: this.getModelName(),
      temperature: 0.2,
    });
  }
}
