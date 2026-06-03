import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { AiService } from './ai.service';
import { BotService } from './bot.service';
import { AiController } from './ai.controller';

@Module({
  imports: [AuthModule, forwardRef(() => ChatsModule)],
  providers: [AiService, BotService],
  controllers: [AiController],
  exports: [AiService, BotService],
})
export class AiModule {}
