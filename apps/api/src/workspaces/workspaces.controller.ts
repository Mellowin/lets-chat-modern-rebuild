import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  ParseUUIDPipe,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { ListAuditLogsQueryDto } from '../audit/dto/list-audit-logs-query.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Workspaces')
@Controller('workspaces')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create workspace' })
  @ApiCreatedResponse({ description: 'Workspace created' })
  @ApiConflictResponse({ description: 'Slug already in use' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List my workspaces' })
  @ApiOkResponse({ description: 'Workspaces list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.workspaces.listForUser(user.id);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get workspace by id' })
  @ApiOkResponse({ description: 'Workspace found' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.findById(workspaceId, user.id);
  }

  @Patch(':workspaceId')
  @ApiOperation({ summary: 'Update workspace' })
  @ApiOkResponse({ description: 'Workspace updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.update(workspaceId, user.id, dto);
  }

  @Post(':workspaceId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive workspace' })
  @ApiOkResponse({ description: 'Workspace archived' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async archive(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.archive(workspaceId, user.id);
  }

  @Post(':workspaceId/leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leave workspace' })
  @ApiOkResponse({ description: 'Left workspace successfully' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async leave(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.leaveWorkspace(workspaceId, user.id);
  }

  @Get(':workspaceId/members')
  @ApiOperation({ summary: 'List workspace members' })
  @ApiOkResponse({ description: 'Members list' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listMembers(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.listMembers(workspaceId, user.id);
  }

  @Post(':workspaceId/members')
  @ApiOperation({ summary: 'Add workspace member' })
  @ApiCreatedResponse({ description: 'Member added' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace or user not found' })
  @ApiConflictResponse({ description: 'Already a member' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async addMember(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.addMember(workspaceId, user.id, dto);
  }

  @Patch(':workspaceId/members/:memberId/role')
  @ApiOperation({ summary: 'Update workspace member role' })
  @ApiOkResponse({ description: 'Member role updated' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace or member not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateMemberRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.updateMemberRole(workspaceId, memberId, dto, user.id);
  }

  @Delete(':workspaceId/members/:memberId')
  @ApiOperation({ summary: 'Remove workspace member' })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace or member not found' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async removeMember(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.removeMember(workspaceId, memberId, user.id);
  }

  @Patch(':workspaceId/owner')
  @ApiOperation({ summary: 'Transfer workspace ownership' })
  @ApiOkResponse({ description: 'Ownership transferred' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace or member not found' })
  @ApiConflictResponse({ description: 'Conflict' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async transferOwnership(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.transferOwnership(workspaceId, user.id, dto);
  }

  @Get(':workspaceId/audit-logs')
  @ApiOperation({ summary: 'List workspace audit logs' })
  @ApiOkResponse({ description: 'Audit logs list' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listAuditLogs(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.workspaces.listAuditLogs(workspaceId, user.id, query.limit ?? 50);
  }
}
