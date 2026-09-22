import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser, Public } from '../../common/decorators';
import { AppConfig } from '../../config/app-config.service';
import { AuthService, Session } from './auth.service';
import { LoginDto } from './dto/login.dto';

export const REFRESH_COOKIE = 'sb_rt';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión (admin / profesional)' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto.email, dto.password, this.meta(req));
    return this.respond(session, res);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar el token de acceso usando la cookie de sesión' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.meta(req));
      return this.respond(session, res);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario de la sesión actual' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }

  private respond(session: Session, res: Response) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN'),
      path: '/api/v1/auth',
    };
  }

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }
}
