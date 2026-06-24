import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { UsersRepository } from './users.repository';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly users: UsersRepository) {}

  @Get('search')
  @ApiOperation({ summary: 'Search users by username or email' })
  @ApiOkResponse({ description: 'Matching users' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async search(@Query('q') q: string, @CurrentUser() user: AuthUserResponse) {
    const trimmed = (q ?? '').trim();
    const results =
      trimmed.length > 0 ? await this.users.search(trimmed, user.id) : [];
    return results.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    }));
  }
}
