import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ChatsService } from './chats.service';
import { CreateDirectDto, CreateGroupDto } from './dto';

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.chats.listChats(user.uid);
  }

  @Post('self')
  createSelf(@CurrentUser() user: AuthUser) {
    return this.chats.getOrCreateSelf(user.uid);
  }

  @Post('direct')
  createDirect(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectDto) {
    return this.chats.getOrCreateDirect(user.uid, dto.otherId);
  }

  @Post('group')
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.chats.createGroup(user.uid, dto.name, dto.memberIds);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') chatId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chats.getMessages(user.uid, chatId, cursor);
  }

  @Get('search/global')
  searchGlobal(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.chats.searchGlobal(user.uid, q ?? '');
  }

  @Get(':id/search')
  search(
    @CurrentUser() user: AuthUser,
    @Param('id') chatId: string,
    @Query('q') q: string,
  ) {
    return this.chats.searchMessages(user.uid, chatId, q ?? '');
  }
}
