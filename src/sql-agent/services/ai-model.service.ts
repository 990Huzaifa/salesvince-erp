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

  private shouldSkipTemperature(modelName: string): boolean {
    return modelName.startsWith('gpt-5');
  }

  private buildModel(temperature?: number): ChatOpenAI {
    const modelName = this.getModelName();

    const baseConfig = {
      apiKey: this.getApiKey(),
      model: modelName,
    };

    if (temperature === undefined || this.shouldSkipTemperature(modelName)) {
      return new ChatOpenAI(baseConfig);
    }

    return new ChatOpenAI({
      ...baseConfig,
      temperature,
    });
  }

  getSqlModel(): ChatOpenAI {
    return this.buildModel(0);
  }

  getAnswerModel(): ChatOpenAI {
    return this.buildModel(0.2);
  }
}
