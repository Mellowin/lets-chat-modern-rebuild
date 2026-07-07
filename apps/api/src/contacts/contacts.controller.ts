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
  ApiForbiddenResponse,
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
  @ApiOperation({ summary: 'Add a contact or send a contact request' })
  @ApiCreatedResponse({ description: 'Contact added or request sent' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'User does not accept requests' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.create(dto, user.id);
  }

  @Get('requests')
  @ApiOperation({ summary: 'List incoming contact requests' })
  @ApiOkResponse({ description: 'Incoming contact requests' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async findRequests(@CurrentUser() user: AuthUserResponse) {
    return this.contacts.listRequests(user.id);
  }

  @Post('requests/:id/accept')
  @ApiOperation({ summary: 'Accept an incoming contact request' })
  @ApiOkResponse({ description: 'Request accepted' })
  @ApiNotFoundResponse({ description: 'Request not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async acceptRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.acceptRequest(id, user.id);
  }

  @Post('requests/:id/decline')
  @ApiOperation({ summary: 'Decline an incoming contact request' })
  @ApiOkResponse({ description: 'Request declined' })
  @ApiNotFoundResponse({ description: 'Request not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async declineRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.declineRequest(id, user.id);
  }

  @Delete('requests/:id')
  @ApiOperation({ summary: 'Cancel an outgoing contact request' })
  @ApiOkResponse({ description: 'Request cancelled' })
  @ApiNotFoundResponse({ description: 'Request not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async cancelRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserResponse,
  ) {
    return this.contacts.cancelRequest(id, user.id);
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
