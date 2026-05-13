import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
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
}
