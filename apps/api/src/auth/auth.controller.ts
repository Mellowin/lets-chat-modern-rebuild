import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  UseGuards,
  ConflictException,
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
import { AuthService } from './auth.service';
import type { AuthUserResponse } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
    const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (user.avatarUpdatedAt) {
      const elapsed = Date.now() - new Date(user.avatarUpdatedAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        throw new ConflictException('Avatar can be changed once every 7 days');
      }
    }

    return this.auth.updateAvatar(user.id, dto.avatarUrl);
  }
}
