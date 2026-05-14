import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
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
  ApiConflictResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';

@ApiTags('Invites')
@Controller('workspaces/:workspaceId/invites')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @ApiOperation({ summary: 'Create workspace invite' })
  @ApiCreatedResponse({ description: 'Invite created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @Get()
  @ApiOperation({ summary: 'List workspace invites' })
  @ApiOkResponse({ description: 'Invites list' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.list(workspaceId, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create workspace invite' })
  @ApiCreatedResponse({ description: 'Invite created' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Workspace not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.create(workspaceId, dto, user.id);
  }

  @Delete(':inviteId')
  @ApiOperation({ summary: 'Revoke workspace invite' })
  @ApiOkResponse({ description: 'Invite revoked' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Invite not found' })
  @ApiConflictResponse({ description: 'Invite already used' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async revoke(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.revoke(workspaceId, inviteId, user.id);
  }
}
