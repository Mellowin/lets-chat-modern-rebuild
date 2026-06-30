import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupMessageDto } from './dto/create-group-message.dto';
import { ListGroupMessagesQueryDto } from './dto/list-group-messages-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Groups')
@Controller('groups')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({ description: 'Group created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List groups I belong to' })
  @ApiOkResponse({ description: 'Groups list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.groups.list(user.id);
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Get group details' })
  @ApiOkResponse({ description: 'Group details' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findOne(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.get(groupId, user.id);
  }

  @Patch(':groupId')
  @ApiOperation({ summary: 'Rename group (owner only)' })
  @ApiOkResponse({ description: 'Group updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.update(groupId, dto, user.id);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: 'Archive group (owner only)' })
  @ApiOkResponse({ description: 'Group archived' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async archive(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.archive(groupId, user.id);
  }

  @Post(':groupId/members')
  @ApiOperation({ summary: 'Add a member (owner only)' })
  @ApiCreatedResponse({ description: 'Member added' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group or user not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async addMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.addMember(groupId, dto, user.id);
  }

  @Delete(':groupId/members/:userId')
  @ApiOperation({ summary: 'Remove a member (owner only)' })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Group or member not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async removeMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.removeMember(groupId, userId, user.id);
  }

  @Post(':groupId/leave')
  @ApiOperation({ summary: 'Leave group' })
  @ApiOkResponse({ description: 'Left group' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async leave(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.leave(groupId, user.id);
  }

  @Get(':groupId/messages')
  @ApiOperation({ summary: 'List group messages' })
  @ApiOkResponse({ description: 'Messages list' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findMessages(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ListGroupMessagesQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.listMessages(groupId, user.id, query);
  }

  @Post(':groupId/messages')
  @ApiOperation({ summary: 'Send a group message' })
  @ApiCreatedResponse({ description: 'Message sent' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async createMessage(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateGroupMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.createMessage(groupId, dto, user.id);
  }

  @Post(':groupId/read')
  @ApiOperation({ summary: 'Mark group as read' })
  @ApiOkResponse({ description: 'Group marked as read' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async markAsRead(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.groups.markAsRead(groupId, user.id);
  }
}
