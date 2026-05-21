import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiGoneResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ChannelInvitesService } from './channel-invites.service';
import { CreateChannelInviteDto } from './dto/create-channel-invite.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Channel Invites')
@Controller()
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ChannelInvitesController {
  constructor(private readonly channelInvites: ChannelInvitesService) {}

  @Post('workspaces/:workspaceId/channels/:channelId/invites')
  @ApiOperation({ summary: 'Create channel invite' })
  @ApiCreatedResponse({ description: 'Channel invite created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace, channel or user not found' })
  @ApiConflictResponse({ description: 'Already invited or member' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: CreateChannelInviteDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channelInvites.create(workspaceId, channelId, dto, user.id);
  }

  @Get('channel-invites/pending')
  @ApiOperation({ summary: 'List pending channel invites for current user' })
  @ApiOkResponse({ description: 'Pending channel invites list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listPending(@CurrentUser() user: AuthUserResponse) {
    return this.channelInvites.listPending(user.id, user.email);
  }

  @Post('channel-invites/:inviteId/accept')
  @ApiOperation({ summary: 'Accept channel invite by id' })
  @ApiOkResponse({ description: 'Channel invite accepted' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiConflictResponse({ description: 'Already used or member' })
  @ApiGoneResponse({ description: 'Invite expired' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async acceptById(
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channelInvites.acceptById(inviteId, user.id, user.email);
  }

  @Post('channel-invites/:inviteId/decline')
  @ApiOperation({ summary: 'Decline channel invite by id' })
  @ApiOkResponse({ description: 'Channel invite declined' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiConflictResponse({ description: 'Invite already used' })
  @ApiGoneResponse({ description: 'Invite expired' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async decline(
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channelInvites.decline(inviteId, user.id, user.email);
  }

  @Get('workspaces/:workspaceId/channels/:channelId/invites')
  @ApiOperation({ summary: 'List channel invites' })
  @ApiOkResponse({ description: 'Channel invites list' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listForChannel(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channelInvites.listForChannel(workspaceId, channelId, user.id);
  }
}
