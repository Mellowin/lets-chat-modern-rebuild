import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
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

  @Get(':token/preview')
  @ApiOperation({ summary: 'Preview invite link without authentication' })
  @ApiOkResponse({ description: 'Invite preview' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  async preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Get('pending')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending invites for current user' })
  @ApiOkResponse({ description: 'Pending invites list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listPending(@CurrentUser() user: AuthUserResponse) {
    return this.invites.listPending(user.id, user.email);
  }

  @Post(':inviteId/accept')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept workspace invite by ID' })
  @ApiOkResponse({ description: 'Invite accepted' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiConflictResponse({ description: 'Already used or member' })
  @ApiGoneResponse({ description: 'Invite expired' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async acceptById(
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.acceptById(inviteId, user.id, user.email);
  }

  @Post(':inviteId/decline')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Decline workspace invite by ID' })
  @ApiOkResponse({ description: 'Invite declined' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiConflictResponse({ description: 'Invite already used' })
  @ApiGoneResponse({ description: 'Invite expired' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async decline(
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.decline(inviteId, user.id, user.email);
  }

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
