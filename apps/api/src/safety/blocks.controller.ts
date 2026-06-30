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
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';

@ApiTags('Blocks')
@Controller('blocks')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  @ApiOperation({ summary: 'List users I have blocked' })
  @ApiOkResponse({ description: 'Blocked users list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.blocks.listBlockedUsers(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Block a user' })
  @ApiCreatedResponse({ description: 'User blocked' })
  @ApiBadRequestResponse({ description: 'Validation failed or self-block' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateBlockDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.blocks.block(user.id, dto.userId, dto.reason);
  }

  @Delete(':blockedUserId')
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiOkResponse({ description: 'User unblocked' })
  @ApiNotFoundResponse({ description: 'Block not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async remove(
    @Param('blockedUserId', ParseUUIDPipe) blockedUserId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.blocks.unblock(user.id, blockedUserId);
  }
}
