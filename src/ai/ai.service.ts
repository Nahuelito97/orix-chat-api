import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatTurn, LlmProvider } from './providers/types';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';

export type { ChatTurn } from './providers/types';

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-opus-4-8',
  openai: 'gpt-4o-mini',
};

/**
 * Servicio de IA agnóstico al proveedor. Se elige por env:
 *   LLM_PROVIDER = gemini | claude | openai   (openai cubre ChatGPT y DeepSeek)
 *   LLM_API_KEY  = <clave>
 *   LLM_MODEL    = <id de modelo>             (opcional; hay default por proveedor)
 *   LLM_BASE_URL = <url>                      (opcional; p.ej. DeepSeek)
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: LlmProvider | null;

  constructor(config: ConfigService) {
    const name = (
      config.get<string>('LLM_PROVIDER', 'gemini') || 'gemini'
    ).toLowerCase();
    const apiKey = config.get<string>('LLM_API_KEY', '');
    const model = config.get<string>('LLM_MODEL') || DEFAULT_MODELS[name] || '';
    const baseUrl = config.get<string>('LLM_BASE_URL');

    this.provider = apiKey ? this.build(name, apiKey, model, baseUrl) : null;
    if (this.provider) {
      this.logger.log(`IA lista — proveedor ${this.provider.name} (${model})`);
    } else {
      this.logger.warn('LLM_API_KEY ausente — features de IA desactivadas');
    }
  }

  private build(
    name: string,
    apiKey: string,
    model: string,
    baseUrl?: string,
  ): LlmProvider {
    switch (name) {
      case 'claude':
      case 'anthropic':
        return new ClaudeProvider(apiKey, model);
      case 'openai':
      case 'chatgpt':
      case 'deepseek':
        return new OpenAiProvider(apiKey, model, baseUrl);
      case 'gemini':
      case 'google':
      default:
        return new GeminiProvider(apiKey, model);
    }
  }

  get enabled(): boolean {
    return this.provider !== null;
  }

  private complete(
    system: string,
    messages: ChatTurn[],
    maxTokens = 1024,
  ): Promise<string> {
    if (!this.provider) {
      throw new ServiceUnavailableException(
        'IA no configurada (falta LLM_API_KEY)',
      );
    }
    return this.provider.complete({ system, messages, maxTokens });
  }

  /** Respuesta del chatbot de ayuda OrixBot. */
  botReply(history: ChatTurn[]): Promise<string> {
    const system = [
      'Sos OrixBot, el asistente de ayuda de OrixChat (una app de chat en tiempo real).',
      'Ayudás a los usuarios a usar la app: enviar mensajes, crear grupos, reacciones,',
      'responder, fijar, llamadas de voz/video, notificaciones, tema claro/oscuro, idioma.',
      'Respondé de forma breve, amable y clara, en el mismo idioma del usuario.',
    ].join(' ');
    return this.complete(system, history, 1024);
  }

  /** Resumen breve de una conversación. */
  summarize(transcript: string, lang = 'es'): Promise<string> {
    const system = `Resumí conversaciones de chat en ${lang}. Devolvé 3-5 viñetas concisas con lo importante. Solo el resumen.`;
    return this.complete(system, [{ role: 'user', content: transcript }], 700);
  }

  /** 3 respuestas sugeridas y cortas para continuar la conversación. */
  async suggestReplies(transcript: string, lang = 'es'): Promise<string[]> {
    const system =
      `Sugerí 3 respuestas breves (máx 8 palabras) que el USUARIO podría enviar a continuación, en ${lang}. ` +
      'Devolvé SOLO un array JSON de strings, sin texto extra. Ej: ["...","...","..."]';
    const raw = await this.complete(
      system,
      [{ role: 'user', content: transcript }],
      300,
    );
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((s): s is string => typeof s === 'string')
          .slice(0, 3);
      }
    } catch {
      /* fallback abajo */
    }
    return raw
      .split('\n')
      .map((l) =>
        l
          .replace(/^[-*\d.)\s"]+/, '')
          .replace(/"$/, '')
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 3);
  }

  /** Traduce un texto al idioma destino. */
  translate(text: string, targetLang: string): Promise<string> {
    const system =
      `Traducí el texto del usuario al idioma "${targetLang}". ` +
      'Devolvé SOLO la traducción, sin comillas ni comentarios.';
    return this.complete(system, [{ role: 'user', content: text }], 1024);
  }
}
