import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Mensaje con las relaciones que el front necesita. */
const messageInclude = {
  sender: { select: { id: true, username: true, name: true, avatar: true } },
  reactions: {
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
  },
  replyTo: {
    select: {
      id: true,
      text: true,
      image: true,
      deletedAt: true,
      sender: { select: { id: true, username: true, name: true } },
    },
  },
} satisfies Prisma.MessageInclude;

/** Filtro: mensajes no expirados (temporales). */
const NOT_EXPIRED = (): Prisma.MessageWhereInput => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {
    this.startExpiryCleanup();
  }

  /** Borra periódicamente los mensajes temporales vencidos. */
  private startExpiryCleanup() {
    setInterval(() => {
      void this.prisma.message
        .deleteMany({ where: { expiresAt: { lte: new Date() } } })
        .catch(() => {});
    }, 60_000);
  }

  // ── Helpers de autorización ──────────────────────────────────────────

  /** Verifica que el usuario participe del chat; devuelve su Participant. */
  private async assertParticipant(userId: string, chatId: string) {
    const p = await this.prisma.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!p) throw new ForbiddenException('No sos parte de este chat');
    return p;
  }

  // ── Listado de chats ─────────────────────────────────────────────────

  /** Chats del usuario, ordenados por actividad, con preview y no-leídos. */
  async listChats(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatar: true,
                lastSeen: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const list = await Promise.all(
      chats.map(async (chat) => {
        const me = chat.participants.find((p) => p.userId === userId)!;
        const others = chat.participants.filter((p) => p.userId !== userId);
        const last = chat.messages[0];

        const unread = await this.prisma.message.count({
          where: {
            chatId: chat.id,
            senderId: { not: userId },
            ...(me.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        });

        return {
          id: chat.id,
          isGroup: chat.isGroup,
          name: chat.name,
          avatar: chat.avatar,
          createdBy: chat.createdBy,
          myRole: me.role,
          muted: me.muted,
          pinned: me.pinnedChat,
          archived: me.archived,
          updatedAt: chat.updatedAt,
          // En 1-a-1 el "otro" define nombre/avatar mostrados.
          participants: chat.participants.map((p) => ({
            ...p.user,
            role: p.role,
          })),
          other: chat.isGroup ? null : (others[0]?.user ?? null),
          lastMessage: last
            ? {
                text: last.deletedAt
                  ? null
                  : (last.text ?? (last.image ? '📷 Imagen' : null)),
                deleted: !!last.deletedAt,
                createdAt: last.createdAt,
                senderId: last.senderId,
              }
            : null,
          unread,
        };
      }),
    );

    // Fijados primero (el orden por updatedAt ya viene de la query; sort estable).
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  /** Fija/desfija o archiva/desarchiva el chat para el usuario. */
  async setChatFlag(
    userId: string,
    chatId: string,
    flag: 'pinnedChat' | 'archived',
  ) {
    const p = await this.assertParticipant(userId, chatId);
    const value = !p[flag];
    await this.prisma.participant.update({
      where: { chatId_userId: { chatId, userId } },
      data: { [flag]: value },
    });
    return { chatId, [flag]: value };
  }

  // ── Crear / obtener chats ────────────────────────────────────────────

  /** Devuelve el chat 1-a-1 con `otherId`, creándolo si no existe. */
  async getOrCreateDirect(userId: string, otherId: string) {
    if (userId === otherId) {
      throw new ForbiddenException('No podés chatear con vos mismo');
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherId } });
    if (!other) throw new NotFoundException('Usuario no encontrado');

    // ¿Ya existe un chat 1-a-1 entre ambos?
    const existing = await this.prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: otherId } } },
        ],
      },
    });
    if (existing) return existing;

    return this.prisma.chat.create({
      data: {
        isGroup: false,
        participants: {
          create: [{ userId }, { userId: otherId }],
        },
      },
    });
  }

  /** Crea un grupo con el creador como admin. */
  async createGroup(userId: string, name: string, memberIds: string[]) {
    const ids = Array.from(new Set([userId, ...memberIds]));
    return this.prisma.chat.create({
      data: {
        isGroup: true,
        name,
        createdBy: userId,
        participants: {
          create: ids.map((id) => ({
            userId: id,
            role: id === userId ? 'admin' : 'member',
          })),
        },
      },
      include: { participants: { include: { user: true } } },
    });
  }

  // ── Administración de grupos ─────────────────────────────────────────

  /** Verifica que el usuario sea admin del grupo. */
  private async assertGroupAdmin(userId: string, chatId: string) {
    const p = await this.assertParticipant(userId, chatId);
    if (p.role !== 'admin') {
      throw new ForbiddenException('Solo un admin puede hacer esto');
    }
  }

  /** Renombra o cambia el avatar del grupo (solo admin). */
  async updateGroup(
    userId: string,
    chatId: string,
    data: { name?: string; avatar?: string },
  ) {
    await this.assertGroupAdmin(userId, chatId);
    return this.prisma.chat.update({ where: { id: chatId }, data });
  }

  /** Agrega miembros al grupo (solo admin). Ignora los que ya están. */
  async addMembers(userId: string, chatId: string, memberIds: string[]) {
    await this.assertGroupAdmin(userId, chatId);
    await this.prisma.participant.createMany({
      data: memberIds.map((id) => ({ chatId, userId: id, role: 'member' })),
      skipDuplicates: true,
    });
  }

  /** Quita a un miembro del grupo (solo admin). */
  async removeMember(userId: string, chatId: string, targetId: string) {
    await this.assertGroupAdmin(userId, chatId);
    await this.prisma.participant.deleteMany({
      where: { chatId, userId: targetId },
    });
  }

  /** El usuario abandona el grupo; si queda vacío, se borra el chat. */
  async leaveGroup(userId: string, chatId: string) {
    await this.assertParticipant(userId, chatId);
    await this.prisma.participant.deleteMany({
      where: { chatId, userId },
    });
    const left = await this.prisma.participant.count({ where: { chatId } });
    if (left === 0) await this.prisma.chat.delete({ where: { id: chatId } });
  }

  /** Borra el chat por completo (mensajes incluidos, en cascada). */
  async deleteChat(userId: string, chatId: string) {
    await this.assertParticipant(userId, chatId);
    await this.prisma.chat.delete({ where: { id: chatId } });
  }

  /** Fija o desfija un mensaje (cualquier participante). */
  async togglePin(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true, pinnedAt: true },
    });
    if (!msg) throw new NotFoundException('Mensaje no encontrado');
    await this.assertParticipant(userId, msg.chatId);
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: msg.pinnedAt ? null : new Date() },
      include: messageInclude,
    });
    return this.shapeMessage(updated);
  }

  /** Marca el chat como entregado hasta ahora (doble check). */
  async markDelivered(userId: string, chatId: string) {
    await this.assertParticipant(userId, chatId);
    const now = new Date();
    await this.prisma.participant.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastDeliveredAt: now },
    });
    return { chatId, userId, lastDeliveredAt: now };
  }

  /** Silencia o reactiva las notificaciones del chat para el usuario. */
  async toggleMute(userId: string, chatId: string) {
    const p = await this.assertParticipant(userId, chatId);
    await this.prisma.participant.update({
      where: { chatId_userId: { chatId, userId } },
      data: { muted: !p.muted },
    });
    return { chatId, muted: !p.muted };
  }

  // ── Mensajes ─────────────────────────────────────────────────────────

  /** Historial paginado (más nuevos primero) con cursor opcional. */
  async getMessages(
    userId: string,
    chatId: string,
    cursor?: string,
    limit = 30,
  ) {
    await this.assertParticipant(userId, chatId);
    const items = await this.prisma.message.findMany({
      where: { chatId, ...NOT_EXPIRED() },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: messageInclude,
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      messages: page.map((m) => this.shapeMessage(m)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async createMessage(
    userId: string,
    chatId: string,
    data: {
      text?: string;
      image?: string;
      audioUrl?: string;
      fileUrl?: string;
      fileName?: string;
      replyToId?: string;
      ttlSeconds?: number; // mensaje temporal
    },
  ) {
    await this.assertParticipant(userId, chatId);
    const expiresAt =
      data.ttlSeconds && data.ttlSeconds > 0
        ? new Date(Date.now() + data.ttlSeconds * 1000)
        : null;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId: userId,
          text: data.text,
          image: data.image,
          audioUrl: data.audioUrl,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          replyToId: data.replyToId,
          expiresAt,
        },
        include: messageInclude,
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return this.shapeMessage(message);
  }

  async editMessage(userId: string, messageId: string, text: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!msg) throw new NotFoundException('Mensaje no encontrado');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Solo podés editar tus mensajes');
    }
    if (msg.deletedAt) throw new ForbiddenException('Mensaje borrado');
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { text, editedAt: new Date() },
      include: messageInclude,
    });
    return this.shapeMessage(updated);
  }

  async deleteMessage(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!msg) throw new NotFoundException('Mensaje no encontrado');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Solo podés borrar tus mensajes');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      // Borrado lógico: vaciamos contenido pero conservamos la fila.
      data: { deletedAt: new Date(), text: null, image: null },
      include: messageInclude,
    });
    return this.shapeMessage(updated);
  }

  // ── Reacciones ───────────────────────────────────────────────────────

  /** Agrega o quita (toggle) una reacción del usuario al mensaje. */
  async toggleReaction(userId: string, messageId: string, emoji: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    });
    if (!msg) throw new NotFoundException('Mensaje no encontrado');
    await this.assertParticipant(userId, msg.chatId);

    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });
    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({
        data: { messageId, userId, emoji },
      });
    }

    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });
    return { chatId: msg.chatId, message: this.shapeMessage(updated!) };
  }

  // ── Read receipts ────────────────────────────────────────────────────

  /** Marca el chat como leído hasta ahora; devuelve el timestamp. */
  async markRead(userId: string, chatId: string) {
    await this.assertParticipant(userId, chatId);
    const now = new Date();
    await this.prisma.participant.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: now },
    });
    return { chatId, userId, lastReadAt: now };
  }

  // ── Búsqueda ─────────────────────────────────────────────────────────

  /** Busca mensajes (texto) dentro de un chat. */
  async searchMessages(userId: string, chatId: string, query: string) {
    await this.assertParticipant(userId, chatId);
    const q = query.trim();
    if (!q) return [];
    const items = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        text: { contains: q, mode: 'insensitive' },
        ...NOT_EXPIRED(),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: messageInclude,
    });
    return items.map((m) => this.shapeMessage(m));
  }

  /** Busca mensajes en TODOS los chats del usuario (búsqueda global). */
  async searchGlobal(userId: string, query: string) {
    const q = query.trim();
    if (!q) return [];
    const items = await this.prisma.message.findMany({
      where: {
        deletedAt: null,
        text: { contains: q, mode: 'insensitive' },
        ...NOT_EXPIRED(),
        chat: { participants: { some: { userId } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        sender: { select: { id: true, username: true, name: true } },
        chat: {
          select: {
            id: true,
            isGroup: true,
            name: true,
            participants: {
              where: { userId: { not: userId } },
              take: 1,
              select: {
                user: { select: { username: true, name: true } },
              },
            },
          },
        },
      },
    });
    return items.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      text: m.text,
      createdAt: m.createdAt,
      sender: m.sender,
      chatName: m.chat.isGroup
        ? (m.chat.name ?? 'Grupo')
        : (m.chat.participants[0]?.user.name ||
          `@${m.chat.participants[0]?.user.username ?? '...'}`),
    }));
  }

  /** Ids de los participantes de un chat (para emitir por socket). */
  async participantIds(chatId: string): Promise<string[]> {
    const ps = await this.prisma.participant.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return ps.map((p) => p.userId);
  }

  // ── Serialización ────────────────────────────────────────────────────

  private shapeMessage(
    m: Prisma.MessageGetPayload<{ include: typeof messageInclude }>,
  ) {
    // Agrupamos reacciones por emoji: { emoji, count, userIds }.
    const grouped = new Map<string, { emoji: string; userIds: string[] }>();
    for (const r of m.reactions) {
      const g = grouped.get(r.emoji) ?? { emoji: r.emoji, userIds: [] };
      g.userIds.push(r.userId);
      grouped.set(r.emoji, g);
    }
    return {
      id: m.id,
      chatId: m.chatId,
      sender: m.sender,
      text: m.deletedAt ? null : m.text,
      image: m.deletedAt ? null : m.image,
      audioUrl: m.deletedAt ? null : m.audioUrl,
      fileUrl: m.deletedAt ? null : m.fileUrl,
      fileName: m.deletedAt ? null : m.fileName,
      pinned: !!m.pinnedAt,
      deleted: !!m.deletedAt,
      edited: !!m.editedAt,
      expiresAt: m.expiresAt,
      createdAt: m.createdAt,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            text: m.replyTo.deletedAt ? null : m.replyTo.text,
            image: m.replyTo.deletedAt ? null : m.replyTo.image,
            deleted: !!m.replyTo.deletedAt,
            sender: m.replyTo.sender,
          }
        : null,
      reactions: [...grouped.values()].map((g) => ({
        emoji: g.emoji,
        count: g.userIds.length,
        userIds: g.userIds,
      })),
    };
  }
}
