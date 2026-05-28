import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ConflictException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import type { AuthUserResponse } from './auth.service';
import { AvatarUploadService } from './avatar-upload.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { UpdateInterfaceLanguageDto } from './dto/update-interface-language.dto';

import { JwtAccessGuard } from './guards/jwt-access.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly avatarUpload: AvatarUploadService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ description: 'User registered successfully' })
  @ApiConflictResponse({ description: 'Email or username already in use' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login existing user' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Login successful' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: 'Tokens refreshed successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout user' })
  @ApiBody({ type: LogoutDto })
  @ApiOkResponse({ description: 'Logout successful' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ description: 'Current user returned successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  me(@CurrentUser() user: AuthUserResponse): AuthUserResponse {
    return user;
  }

  @Patch('me')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current authenticated user display name' })
  @ApiOkResponse({ description: 'User updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateMe(
    @CurrentUser() user: AuthUserResponse,
    @Body() dto: UpdateDisplayNameDto,
  ): Promise<AuthUserResponse> {
    const displayName = dto.displayName?.trim() || null;
    return this.auth.updateMe(user.id, displayName);
  }

  @Patch('me/avatar')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current authenticated user avatar' })
  @ApiOkResponse({ description: 'Avatar updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Avatar cooldown active' })
  async updateAvatar(
    @CurrentUser() user: AuthUserResponse,
    @Body() dto: UpdateAvatarDto,
  ): Promise<AuthUserResponse> {
    this.assertAvatarCooldown(user.avatarUpdatedAt);

    return this.auth.updateAvatar(user.id, dto.avatarUrl);
  }

  @Patch('me/avatar/upload')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload current authenticated user avatar image' })
  @ApiOkResponse({ description: 'Avatar uploaded successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Avatar cooldown active' })
  @UseInterceptors(FileInterceptor('avatar'))
  async updateAvatarUpload(
    @CurrentUser() user: AuthUserResponse,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<AuthUserResponse> {
    this.assertAvatarCooldown(user.avatarUpdatedAt);

    const avatarUrl = await this.avatarUpload.save(file, user.id);
    return this.auth.updateAvatar(user.id, avatarUrl);
  }

  @Patch('me/interface-language')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current authenticated user interface language',
  })
  @ApiOkResponse({ description: 'Interface language updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateInterfaceLanguage(
    @CurrentUser() user: AuthUserResponse,
    @Body() dto: UpdateInterfaceLanguageDto,
  ): Promise<AuthUserResponse> {
    return this.auth.updateInterfaceLanguage(user.id, dto.interfaceLanguage);
  }

  private assertAvatarCooldown(avatarUpdatedAt: Date | null): void {
    const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

    if (avatarUpdatedAt) {
      const elapsed = Date.now() - new Date(avatarUpdatedAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        throw new ConflictException('Avatar can be changed once every 7 days');
      }
    }
  }
}
