import { GoogleGenAI } from '@google/genai';
import type { CompleteOptions, LlmProvider } from './types';

/** Google Gemini (@google/genai). */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete({
    system,
    messages,
    maxTokens,
  }: CompleteOptions): Promise<string> {
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: { systemInstruction: system, maxOutputTokens: maxTokens },
    });
    return (res.text ?? '').trim();
  }
}
