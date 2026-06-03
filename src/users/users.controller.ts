import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { UsersService } from './users.service';
import { SyncUserDto, UpdateProfileDto } from './dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Login: crea/actualiza el usuario en Postgres y lo devuelve. */
  @Post('sync')
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncUserDto) {
    return this.users.sync(user, dto.username);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.uid);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.uid, dto);
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.users.search(q ?? '', user.uid);
  }
}
