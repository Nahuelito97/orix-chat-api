import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [ChatsService, ChatGateway],
  controllers: [ChatsController],
})
export class ChatsModule {}
