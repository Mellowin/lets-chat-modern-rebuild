import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  UseGuards,
  GoneException,
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
  ApiUnauthorizedResponse,
  ApiGoneResponse,
} from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AddChannelMemberDto } from './dto/add-channel-member.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Channels')
@Controller('workspaces/:workspaceId/channels')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create channel' })
  @ApiCreatedResponse({ description: 'Channel created' })
  @ApiConflictResponse({ description: 'Channel slug already in use' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateChannelDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.create(workspaceId, dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List workspace channels' })
  @ApiOkResponse({ description: 'Channels list' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.list(workspaceId, user.id);
  }

  @Get('archived')
  @ApiOperation({ summary: 'List archived workspace channels' })
  @ApiOkResponse({ description: 'Archived channels list' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findArchived(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.listArchived(workspaceId, user.id);
  }

  @Post(':channelId/read')
  @ApiOperation({ summary: 'Mark channel as read' })
  @ApiOkResponse({ description: 'Channel marked as read' })
  @ApiNotFoundResponse({ description: 'Workspace or channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async markRead(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.markChannelRead(workspaceId, channelId, user.id);
  }

  @Get(':channelId')
  @ApiOperation({ summary: 'Get channel by id' })
  @ApiOkResponse({ description: 'Channel found' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.findById(workspaceId, channelId, user.id);
  }

  @Patch(':channelId')
  @ApiOperation({ summary: 'Update channel' })
  @ApiOkResponse({ description: 'Channel updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.update(workspaceId, channelId, dto, user.id);
  }

  @Get(':channelId/members')
  @ApiOperation({ summary: 'List channel members' })
  @ApiOkResponse({ description: 'Members list' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listMembers(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.listChannelMembers(workspaceId, channelId, user.id);
  }

  @Post(':channelId/members')
  @ApiOperation({ summary: 'Add channel member (disabled)' })
  @ApiGoneResponse({ description: 'Use channel invitations to add members' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  /* eslint-disable @typescript-eslint/no-unused-vars */
  // eslint-disable-next-line @typescript-eslint/require-await
  async addMember(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Body() dto: AddChannelMemberDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    throw new GoneException('Use channel invitations to add members');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  @Delete(':channelId/members/:memberId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove channel member' })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.removeChannelMember(
      workspaceId,
      channelId,
      memberId,
      user.id,
    );
  }

  @Post(':channelId/leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leave channel' })
  @ApiOkResponse({ description: 'Left channel successfully' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async leave(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.leaveChannel(workspaceId, channelId, user.id);
  }

  @Delete(':channelId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently delete channel' })
  @ApiOkResponse({ description: 'Channel deleted' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.delete(workspaceId, channelId, user.id);
  }

  @Post(':channelId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive channel' })
  @ApiOkResponse({ description: 'Channel archived' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.archive(workspaceId, channelId, user.id);
  }

  @Post(':channelId/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore archived channel' })
  @ApiOkResponse({ description: 'Channel restored' })
  @ApiConflictResponse({ description: 'Channel is not archived' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async restore(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.channels.restore(workspaceId, channelId, user.id);
  }
}
