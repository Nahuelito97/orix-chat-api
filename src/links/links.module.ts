import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LinksService } from './links.service';
import { LinksController } from './links.controller';

@Module({
  imports: [AuthModule],
  providers: [LinksService],
  controllers: [LinksController],
})
export class LinksModule {}
