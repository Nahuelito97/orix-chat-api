import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { FirebaseService } from '../firebase/firebase.service';
import { UsersService } from '../users/users.service';
import { ChatsService } from './chats.service';

/** Datos que guardamos en cada socket tras autenticar. */
interface SocketData {
  uid: string;
}
type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/**
 * Realtime de OrixChat sobre Socket.IO.
 *
 * Auth: el front pasa el ID token de Firebase en `handshake.auth.token`.
 * Rooms: `user:<uid>` (personal, para la lista de chats) y
 *        `chat:<chatId>` (conversación abierta).
 */
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly users: UsersService,
    private readonly chats: ChatsService,
  ) {}

  // ── Ciclo de vida ────────────────────────────────────────────────────

  async handleConnection(socket: AppSocket) {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return socket.disconnect();
    try {
      const decoded = await this.firebase.verifyIdToken(token);
      socket.data.uid = decoded.uid;
      void socket.join(`user:${decoded.uid}`);
      await this.users.touchLastSeen(decoded.uid);
      this.broadcastPresence(decoded.uid, true);
      this.logger.log(`conectado ${decoded.uid}`);
    } catch {
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: AppSocket) {
    const uid = socket.data.uid;
    if (!uid) return;
    await this.users.touchLastSeen(uid);
    // Sólo lo marcamos offline si no le queda otra pestaña conectada.
    const sockets = await this.server.in(`user:${uid}`).fetchSockets();
    if (sockets.length === 0) this.broadcastPresence(uid, false);
  }

  private broadcastPresence(userId: string, online: boolean) {
    this.server.emit('presence', { userId, online, at: Date.now() });
  }

  // ── Entrar / salir de un chat ────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async joinChat(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    const uid = socket.data.uid;
    const participants = await this.chats.participantIds(chatId);
    if (!participants.includes(uid)) return;
    void socket.join(`chat:${chatId}`);
  }

  @SubscribeMessage('chat:leave')
  leaveChat(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    void socket.leave(`chat:${chatId}`);
  }

  // ── Mensajes ─────────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody()
    body: {
      chatId: string;
      text?: string;
      image?: string;
      fileUrl?: string;
      fileName?: string;
      replyToId?: string;
    },
  ) {
    const uid = socket.data.uid;
    const message = await this.chats.createMessage(uid, body.chatId, {
      text: body.text,
      image: body.image,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      replyToId: body.replyToId,
    });
    // A todos los que tienen el chat abierto.
    this.server.to(`chat:${body.chatId}`).emit('message:new', message);
    // A la lista de chats de cada participante (reordenar + no-leído).
    await this.bumpChatList(body.chatId);
    return message;
  }

  @SubscribeMessage('message:edit')
  async onEdit(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { messageId, text }: { messageId: string; text: string },
  ) {
    const uid = socket.data.uid;
    const message = await this.chats.editMessage(uid, messageId, text);
    this.server.to(`chat:${message.chatId}`).emit('message:update', message);
    return message;
  }

  @SubscribeMessage('message:delete')
  async onDelete(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { messageId }: { messageId: string },
  ) {
    const uid = socket.data.uid;
    const message = await this.chats.deleteMessage(uid, messageId);
    this.server.to(`chat:${message.chatId}`).emit('message:update', message);
    return message;
  }

  // ── Reacciones ───────────────────────────────────────────────────────

  @SubscribeMessage('reaction:toggle')
  async onReaction(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { messageId, emoji }: { messageId: string; emoji: string },
  ) {
    const uid = socket.data.uid;
    const { chatId, message } = await this.chats.toggleReaction(
      uid,
      messageId,
      emoji,
    );
    this.server.to(`chat:${chatId}`).emit('message:update', message);
    return message;
  }

  @SubscribeMessage('message:pin')
  async onPin(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { messageId }: { messageId: string },
  ) {
    const uid = socket.data.uid;
    const message = await this.chats.togglePin(uid, messageId);
    this.server.to(`chat:${message.chatId}`).emit('message:update', message);
    return message;
  }

  // ── Typing ───────────────────────────────────────────────────────────

  @SubscribeMessage('typing')
  onTyping(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId, typing }: { chatId: string; typing: boolean },
  ) {
    const uid = socket.data.uid;
    socket.to(`chat:${chatId}`).emit('typing', { chatId, userId: uid, typing });
  }

  // ── Read receipts ────────────────────────────────────────────────────

  @SubscribeMessage('read')
  async onRead(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    const uid = socket.data.uid;
    const receipt = await this.chats.markRead(uid, chatId);
    this.server.to(`chat:${chatId}`).emit('read', receipt);
    // También al propio usuario en sus otras pestañas (resetear no-leído).
    this.server.to(`user:${uid}`).emit('read', receipt);
    return receipt;
  }

  @SubscribeMessage('delivered')
  async onDelivered(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    const uid = socket.data.uid;
    const receipt = await this.chats.markDelivered(uid, chatId);
    this.server.to(`chat:${chatId}`).emit('delivered', receipt);
    return receipt;
  }

  @SubscribeMessage('chat:mute')
  async onMute(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    const uid = socket.data.uid;
    const res = await this.chats.toggleMute(uid, chatId);
    this.server.to(`user:${uid}`).emit('chat:bump', { chatId });
    return res;
  }

  // ── Administración de grupos / chats ─────────────────────────────────

  @SubscribeMessage('group:update')
  async onGroupUpdate(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody()
    {
      chatId,
      name,
      avatar,
    }: { chatId: string; name?: string; avatar?: string },
  ) {
    const uid = socket.data.uid;
    await this.chats.updateGroup(uid, chatId, { name, avatar });
    await this.bumpChatList(chatId);
  }

  @SubscribeMessage('group:addMembers')
  async onAddMembers(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody()
    { chatId, memberIds }: { chatId: string; memberIds: string[] },
  ) {
    const uid = socket.data.uid;
    await this.chats.addMembers(uid, chatId, memberIds);
    await this.bumpChatList(chatId); // incluye a los nuevos
  }

  @SubscribeMessage('group:removeMember')
  async onRemoveMember(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId, userId }: { chatId: string; userId: string },
  ) {
    const uid = socket.data.uid;
    await this.chats.removeMember(uid, chatId, userId);
    this.server.to(`user:${userId}`).emit('chat:gone', { chatId });
    await this.bumpChatList(chatId);
  }

  @SubscribeMessage('chat:leaveGroup')
  async onLeaveGroup(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    const uid = socket.data.uid;
    // Avisamos al resto antes de irnos.
    const ids = await this.chats.participantIds(chatId);
    await this.chats.leaveGroup(uid, chatId);
    this.server.to(`user:${uid}`).emit('chat:gone', { chatId });
    for (const id of ids) {
      if (id !== uid)
        this.server.to(`user:${id}`).emit('chat:bump', { chatId });
    }
  }

  @SubscribeMessage('chat:delete')
  async onDeleteChat(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { chatId }: { chatId: string },
  ) {
    const uid = socket.data.uid;
    const ids = await this.chats.participantIds(chatId);
    await this.chats.deleteChat(uid, chatId);
    for (const id of ids) {
      this.server.to(`user:${id}`).emit('chat:gone', { chatId });
    }
  }

  // ── Util ─────────────────────────────────────────────────────────────

  /** Avisa a cada participante que su lista de chats cambió. */
  private async bumpChatList(chatId: string) {
    const ids = await this.chats.participantIds(chatId);
    for (const id of ids) {
      this.server.to(`user:${id}`).emit('chat:bump', { chatId });
    }
  }
}
