import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AiModule } from '../ai/ai.module';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule, UsersModule, forwardRef(() => AiModule)],
  providers: [ChatsService, ChatGateway],
  controllers: [ChatsController],
  exports: [ChatsService],
})
export class ChatsModule {}
