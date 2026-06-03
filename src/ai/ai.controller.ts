import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ChatsService } from '../chats/chats.service';
import { AiService } from './ai.service';
import { AssistDto, TranslateDto } from './dto';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly chats: ChatsService,
  ) {}

  /** Transcript "Nombre: texto" de los últimos mensajes del chat. */
  private async transcript(userId: string, chatId: string): Promise<string> {
    const { messages } = await this.chats.getMessages(
      userId,
      chatId,
      undefined,
      40,
    );
    return messages
      .reverse() // cronológico
      .filter((m) => m.text)
      .map((m) => `${m.sender.name || '@' + m.sender.username}: ${m.text}`)
      .join('\n');
  }

  @Post('chats/:id/summarize')
  async summarize(
    @CurrentUser() user: AuthUser,
    @Param('id') chatId: string,
    @Body() dto: AssistDto,
  ) {
    const transcript = await this.transcript(user.uid, chatId);
    return { summary: await this.ai.summarize(transcript, dto.lang ?? 'es') };
  }

  @Post('chats/:id/suggest')
  async suggest(
    @CurrentUser() user: AuthUser,
    @Param('id') chatId: string,
    @Body() dto: AssistDto,
  ) {
    const transcript = await this.transcript(user.uid, chatId);
    return {
      suggestions: await this.ai.suggestReplies(transcript, dto.lang ?? 'es'),
    };
  }

  @Post('translate')
  async translate(@Body() dto: TranslateDto) {
    return { translation: await this.ai.translate(dto.text, dto.to) };
  }
}
