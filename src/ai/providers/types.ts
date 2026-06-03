export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
}

/** Proveedor de LLM intercambiable (Gemini, Claude, OpenAI/DeepSeek…). */
export interface LlmProvider {
  readonly name: string;
  complete(opts: CompleteOptions): Promise<string>;
}
