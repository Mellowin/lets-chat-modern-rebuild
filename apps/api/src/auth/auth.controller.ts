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
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import type { AuthUserResponse } from './auth.service';
import { AvatarUploadService } from './avatar-upload.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
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

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify email address' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({ description: 'Email verified successfully' })
  @ApiNotFoundResponse({ description: 'Invalid or expired token' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiOkResponse({ description: 'Request processed' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: 'Request processed' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiNotFoundResponse({ description: 'Invalid or expired token' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('change-email/request')
  @UseGuards(JwtAccessGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request email change' })
  @ApiBody({ type: RequestEmailChangeDto })
  @ApiOkResponse({ description: 'Email change requested' })
  @ApiConflictResponse({ description: 'Email already in use' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async requestEmailChange(
    @CurrentUser() user: AuthUserResponse,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.auth.requestEmailChange(user.id, dto.newEmail);
  }

  @Post('change-email/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm email change' })
  @ApiBody({ type: ConfirmEmailChangeDto })
  @ApiOkResponse({ description: 'Email changed successfully' })
  @ApiNotFoundResponse({ description: 'Invalid or expired token' })
  @ApiConflictResponse({ description: 'Email already in use' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.auth.confirmEmailChange(dto.token);
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
