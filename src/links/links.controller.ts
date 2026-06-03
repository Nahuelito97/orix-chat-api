import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { LinksService } from './links.service';

@Controller('links')
@UseGuards(AuthGuard)
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get('preview')
  preview(@Query('url') url: string) {
    return this.links.preview(url ?? '');
  }
}
