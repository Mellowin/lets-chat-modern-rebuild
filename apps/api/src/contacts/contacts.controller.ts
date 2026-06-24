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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserResponse } from '../auth/auth.service';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(JwtAccessGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List my contacts' })
  @ApiOkResponse({ description: 'Contacts list' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUserResponse) {
    return this.contacts.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a contact' })
  @ApiCreatedResponse({ description: 'Contact added' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.create(dto, user.id);
  }

  @Delete(':contactUserId')
  @ApiOperation({ summary: 'Remove a contact' })
  @ApiOkResponse({ description: 'Contact removed' })
  @ApiNotFoundResponse({ description: 'Contact not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async remove(
    @Param('contactUserId', ParseUUIDPipe) contactUserId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.remove(contactUserId, user.id);
  }

  @Post(':contactUserId/start-dm')
  @ApiOperation({ summary: 'Start or open a DM with a contact' })
  @ApiCreatedResponse({
    description: 'Direct conversation created or returned',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Contact not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async startDm(
    @Param('contactUserId', ParseUUIDPipe) contactUserId: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.startDirectConversation(contactUserId, user.id);
  }
}
