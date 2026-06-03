import Anthropic from '@anthropic-ai/sdk';
import type { CompleteOptions, LlmProvider } from './types';

/** Anthropic Claude (@anthropic-ai/sdk). */
export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete({
    system,
    messages,
    maxTokens,
  }: CompleteOptions): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }
}
