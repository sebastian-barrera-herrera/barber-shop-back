import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuthUser } from '../../common/auth-user';
import { BusinessId, CurrentUser, Public, Roles } from '../../common/decorators';
import { BusinessService } from '../business/business.service';
import { ChatService } from './chat.service';

class MessageDto {
  @ApiProperty({ example: 'Hola, ¿puedo cambiar mi cita para las 5?' })
  @IsString()
  @MaxLength(2000)
  body!: string;
}

class StartConversationDto extends MessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;
}

@ApiTags('Mensajes')
@ApiBearerAuth()
@Roles('OWNER', 'ADMIN')
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Conversaciones, la más reciente primero, con no leídos' })
  list(@CurrentUser() user: AuthUser) {
    return this.chat.list(user);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Total de mensajes sin leer (para el contador del menú)' })
  unread(@BusinessId() businessId: string) {
    return this.chat.unreadCount(businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Escribirle a un cliente' })
  start(@CurrentUser() user: AuthUser, @Body() dto: StartConversationDto) {
    return this.chat.startWith(user, dto.customerId, dto.body);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensajes de una conversación' })
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.messages(user, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Responder' })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
  ) {
    return this.chat.send(user, id, dto.body);
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar como leída' })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markRead(user, id);
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug/appointments/by-token/:token/messages')
export class PublicChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly business: BusinessService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Mensajes con el negocio (desde el enlace de la cita)' })
  async thread(@Param('slug') slug: string, @Param('token') token: string) {
    return this.chat.publicThread(await this.business.resolveSlug(slug), token);
  }

  @Post()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'Escribirle al negocio' })
  async send(@Param('slug') slug: string, @Param('token') token: string, @Body() dto: MessageDto) {
    return this.chat.publicSend(await this.business.resolveSlug(slug), token, dto.body);
  }
}
