import {
  Controller,
  Post,
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
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.invites.create(workspaceId, dto, user.id);
  }
}
