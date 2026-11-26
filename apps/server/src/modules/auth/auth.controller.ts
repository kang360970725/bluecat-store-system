import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUser } from '@bluecat/shared';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    const forwarded = request.headers['x-forwarded-for'];
    const ipAddress =
      (Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded?.split(',')[0]
      )?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      undefined;
    return this.authService.login(dto, {
      ipAddress,
      userAgent: request.headers['user-agent']
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUserInfo() user: CurrentUser) {
    return user;
  }

  @Post('switch-store')
  @UseGuards(JwtAuthGuard)
  switchStore(
    @CurrentUserInfo() user: CurrentUser,
    @Body() body: { storeId?: string }
  ) {
    return this.authService.switchStore(user, String(body.storeId ?? ''));
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUserInfo() user: CurrentUser,
    @Body() dto: ChangePasswordDto
  ) {
    return this.authService.changePassword(user, dto);
  }
}
