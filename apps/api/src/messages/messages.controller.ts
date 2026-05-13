import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Messages')
@Controller('workspaces/:workspaceId/channels/:channelId/messages')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Create message' })
  @ApiCreatedResponse({ description: 'Message created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.create(workspaceId, channelId, dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List messages' })
  @ApiOkResponse({ description: 'Messages list' })
  @ApiNotFoundResponse({ description: 'Channel not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.messages.list(workspaceId, channelId, user.id, query);
  }
}
