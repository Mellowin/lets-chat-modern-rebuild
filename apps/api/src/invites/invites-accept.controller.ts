import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiGoneResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Invites')
@Controller('invites')
export class InvitesAcceptController {
  constructor(private readonly invites: InvitesService) {}

  @Post('accept')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept workspace invite' })
  @ApiOkResponse({ description: 'Invite accepted' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiConflictResponse({ description: 'Already used or member' })
  @ApiGoneResponse({ description: 'Invite expired' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async accept(
    @Body() dto: AcceptInviteDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.accept(dto.token, user.id, user.email);
  }
}
