import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import { AiService, type ChatTurn } from './ai.service';

export const ORIXBOT_ID = 'orixbot';
const HISTORY_LIMIT = 16;

/** Usuario asistente "OrixBot" que responde con la API de Claude. */
@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly ai: AiService,
  ) {}

  /** Crea/asegura el usuario OrixBot al arrancar. */
  async onModuleInit() {
    await this.prisma.user.upsert({
      where: { id: ORIXBOT_ID },
      update: {},
      create: {
        id: ORIXBOT_ID,
        username: 'orixbot',
        name: 'OrixBot 🤖',
        email: '',
        bio: 'Soy el asistente de OrixChat. Preguntame lo que necesites 👋',
        avatar: '',
      },
    });
    this.logger.log('OrixBot listo');
  }

  /**
   * Asegura que el usuario tenga un chat con OrixBot (como el widget de ayuda
   * de una web). Lo crea con un mensaje de bienvenida la primera vez.
   * Devuelve el id del chat, o null si la IA está desactivada.
   */
  async ensureBotChat(userId: string): Promise<string | null> {
    if (!this.ai.enabled || userId === ORIXBOT_ID) return null;
    const chat = await this.chats.getOrCreateDirect(userId, ORIXBOT_ID);
    const count = await this.prisma.message.count({
      where: { chatId: chat.id },
    });
    if (count === 0) {
      await this.chats.createMessage(ORIXBOT_ID, chat.id, {
        text: '¡Hola! 👋 Soy OrixBot. Preguntame lo que necesites sobre OrixChat: grupos, llamadas, reacciones, tema, idioma… ¿En qué te ayudo?',
      });
    }
    return chat.id;
  }

  /**
   * Si el chat tiene al bot como participante y el emisor no es el bot,
   * devuelve el id del bot; si no, null.
   */
  async botParticipant(
    chatId: string,
    senderId: string,
  ): Promise<string | null> {
    if (!this.ai.enabled || senderId === ORIXBOT_ID) return null;
    const bot = await this.prisma.participant.findUnique({
      where: { chatId_userId: { chatId, userId: ORIXBOT_ID } },
    });
    return bot ? ORIXBOT_ID : null;
  }

  /** Genera y persiste la respuesta del bot en el chat; la devuelve. */
  async reply(chatId: string) {
    const rows = await this.prisma.message.findMany({
      where: { chatId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        senderId: true,
        text: true,
        image: true,
        audioUrl: true,
        fileUrl: true,
      },
    });

    // Cronológico y mapeado a turnos para Claude.
    const turns: ChatTurn[] = rows
      .reverse()
      .map((m) => ({
        role:
          m.senderId === ORIXBOT_ID
            ? ('assistant' as const)
            : ('user' as const),
        content:
          m.text ??
          (m.image
            ? '[imagen]'
            : m.audioUrl
              ? '[nota de voz]'
              : m.fileUrl
                ? '[archivo]'
                : ''),
      }))
      .filter((t) => t.content);

    // La API exige que el primer turno sea del usuario.
    while (turns.length && turns[0].role === 'assistant') turns.shift();
    if (turns.length === 0) return null;

    const text = await this.ai.botReply(turns);
    return this.chats.createMessage(ORIXBOT_ID, chatId, { text });
  }
}
