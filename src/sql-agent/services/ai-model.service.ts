import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

type Gpt5ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

interface BuildModelOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  reasoningEffort?: Gpt5ReasoningEffort;
  streaming?: boolean;
  cacheKey: string;
}

@Injectable()
export class AiModelService {
  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string {
    const key = this.configService
      .get<string>('OPENAI_API_KEY')
      ?.trim();

    if (!key) {
      throw new Error('OPENAI_API_KEY is missing in .env');
    }

    return key;
  }

  private getSqlModelName(): string {
    return (
      this.configService.get<string>('SQL_AGENT_MODEL')?.trim() ||
      'gpt-5-mini'
    );
  }

  private getAnswerModelName(): string {
    return (
      this.configService.get<string>('ANSWER_MODEL')?.trim() ||
      'gpt-4.1-mini'
    );
  }

  private getSqlReasoningEffort(): Gpt5ReasoningEffort {
    const effort =
      this.configService
        .get<string>('SQL_REASONING_EFFORT')
        ?.trim()
        .toLowerCase() || 'minimal';

    const allowed: Gpt5ReasoningEffort[] = [
      'minimal',
      'low',
      'medium',
      'high',
    ];

    return allowed.includes(effort as Gpt5ReasoningEffort)
      ? (effort as Gpt5ReasoningEffort)
      : 'minimal';
  }

  private isGpt5Model(model: string): boolean {
    return model.startsWith('gpt-5');
  }

  private buildModel(options: BuildModelOptions): ChatOpenAI {
    const commonOptions = {
      apiKey: this.getApiKey(),
      model: options.model,

      // Prevent unnecessarily long model responses.
      maxTokens: options.maxTokens,

      // Prevent requests hanging indefinitely.
      timeout: 30_000,

      // Retries help transient failures, but too many retries increase latency.
      maxRetries: 1,

      streaming: options.streaming ?? false,
    };

    if (this.isGpt5Model(options.model)) {
      return new ChatOpenAI({
        ...commonOptions,

        // Recommended for GPT-5 tool-calling and agent workflows.
        useResponsesApi: true,

        // Main GPT-5 latency control.
        reasoning: {
          effort: options.reasoningEffort ?? 'minimal',
        },

        // Keep visible responses short.
        verbosity: 'low',

        // Helps cache repeated system instructions/schema prefixes.
        promptCacheKey: options.cacheKey,
      });
    }

    return new ChatOpenAI({
      ...commonOptions,
      temperature: options.temperature ?? 0,
    });
  }

  getSqlModel(): ChatOpenAI {
    return this.buildModel({
      model: this.getSqlModelName(),
      reasoningEffort: this.getSqlReasoningEffort(),

      // SQL and tool calls should normally be short.
      maxTokens: 400,
      temperature: 0,
      streaming: false,
      cacheKey: 'sql-agent-schema-v1',
    });
  }

  getAnswerModel(): ChatOpenAI {
    return this.buildModel({
      model: this.getAnswerModelName(),

      // Used only if ANSWER_MODEL is also GPT-5.
      reasoningEffort: 'minimal',

      maxTokens: 600,
      temperature: 0.2,
      streaming: true,
      cacheKey: 'sql-agent-answer-v1',
    });
  }
}