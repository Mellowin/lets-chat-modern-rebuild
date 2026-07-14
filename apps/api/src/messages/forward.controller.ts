import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { ForwardService } from './forward.service';
import { ForwardMessageDto } from './dto/forward-message.dto';

@ApiTags('Messages')
@Controller('messages/forward')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ForwardController {
  constructor(private readonly forwardService: ForwardService) {}

  @Post()
  @ApiOperation({ summary: 'Forward a message to another channel, DM or group' })
  @ApiCreatedResponse({ description: 'Message forwarded' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Source or destination not found' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async forward(
    @Body() dto: ForwardMessageDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.forwardService.forward(dto, user.id);
  }
}
