import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { GroupInvitesService } from './group-invites.service';
import { CreateGroupInviteDto } from './dto/create-group-invite.dto';

@ApiTags('Group Invites')
@Controller()
export class GroupInvitesController {
  constructor(private readonly groupInvites: GroupInvitesService) {}

  @Post('groups/:groupId/invites')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a group invite link (owner only)' })
  @ApiCreatedResponse({ description: 'Invite link created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateGroupInviteDto = {},
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groupInvites.createInvite(groupId, dto, user.id);
  }

  @Get('groups/:groupId/invites')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List group invite links (owner only)' })
  @ApiOkResponse({ description: 'Invite links list' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groupInvites.listInvites(groupId, user.id);
  }

  @Delete('groups/:groupId/invites/:inviteId')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a group invite link (owner only)' })
  @ApiOkResponse({ description: 'Invite revoked' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async revoke(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groupInvites.revokeInvite(groupId, inviteId, user.id);
  }

  @Get('group-invites/:token')
  @ApiOperation({ summary: 'Preview a group invite link' })
  @ApiOkResponse({ description: 'Invite preview' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  async preview(@Param('token') token: string) {
    return this.groupInvites.preview(token);
  }

  @Post('group-invites/:token/accept')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a group invite link' })
  @ApiCreatedResponse({ description: 'Joined group' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Invite or group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groupInvites.accept(token, user.id);
  }
}
