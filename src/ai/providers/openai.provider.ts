import OpenAI from 'openai';
import type { CompleteOptions, LlmProvider } from './types';

/**
 * Compatible con la API de OpenAI: cubre ChatGPT y también DeepSeek u otros
 * servicios OpenAI-compatibles, cambiando `baseURL` (LLM_BASE_URL).
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseURL || undefined });
  }

  async complete({
    system,
    messages,
    maxTokens,
  }: CompleteOptions): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return (res.choices[0]?.message?.content ?? '').trim();
  }
}
