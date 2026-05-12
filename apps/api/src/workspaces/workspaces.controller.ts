import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
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
}
