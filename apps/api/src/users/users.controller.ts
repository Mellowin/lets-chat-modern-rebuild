import {
  Controller,
  Get,
  Patch,
  Query,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { UsersRepository } from './users.repository';
import { UpdateContactPrivacyDto } from './dto/update-contact-privacy.dto';

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
      contactPrivacySetting: u.contactPrivacySetting,
    }));
  }

  @Get('me/contact-privacy')
  @ApiOperation({ summary: 'Get my contact privacy setting' })
  @ApiOkResponse({ description: 'Contact privacy setting' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getContactPrivacy(@CurrentUser() user: AuthUserResponse) {
    const full = await this.users.findById(user.id);
    return {
      contactPrivacySetting: full?.contactPrivacySetting ?? 'REQUESTS_ONLY',
    };
  }

  @Patch('me/contact-privacy')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Update my contact privacy setting' })
  @ApiOkResponse({ description: 'Contact privacy setting updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateContactPrivacy(
    @Body() dto: UpdateContactPrivacyDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    const updated = await this.users.updateContactPrivacySetting(
      user.id,
      dto.contactPrivacySetting,
    );
    return {
      contactPrivacySetting: updated.contactPrivacySetting,
    };
  }
}
