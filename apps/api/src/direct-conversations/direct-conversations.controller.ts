import {
  Controller,
  Get,
  Post,
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
import { DirectConversationsService } from './direct-conversations.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Direct Conversations')
@Controller('direct-conversations')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class DirectConversationsController {
  constructor(
    private readonly directConversations: DirectConversationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create or open a direct conversation' })
  @ApiCreatedResponse({
    description: 'Direct conversation created or returned',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateDirectConversationDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List my direct conversations' })
  @ApiOkResponse({ description: 'Direct conversations list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.directConversations.list(user.id);
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a direct conversation' })
  @ApiOkResponse({ description: 'Messages list' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.listMessages(conversationId, user.id);
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: 'Send a direct message' })
  @ApiCreatedResponse({ description: 'Direct message sent' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async createMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateDirectMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.directConversations.createMessage(conversationId, dto, user.id);
  }
}
