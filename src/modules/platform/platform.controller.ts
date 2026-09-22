import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { AppConfig } from '../../config/app-config.service';
import { sendSession } from '../auth/session-cookie';
import { RegisterBusinessDto } from './dto/register.dto';
import { PlatformService } from './platform.service';

@ApiTags('Plataforma')
@Public()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly config: AppConfig,
  ) {}

  @Get('slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: '¿Está libre esta dirección? (o sugerir una a partir del nombre)' })
  @ApiQuery({ name: 'slug', required: false })
  @ApiQuery({ name: 'name', required: false })
  checkSlug(@Query('slug') slug?: string, @Query('name') name?: string) {
    return this.platform.checkSlug({ slug: slug?.slice(0, 60), name: name?.slice(0, 80) });
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Registrar un negocio nuevo (registro libre) y abrir sesión' })
  async register(
    @Body() dto: RegisterBusinessDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, business } = await this.platform.register(dto, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    return { ...sendSession(session, res, this.config), business };
  }
}
