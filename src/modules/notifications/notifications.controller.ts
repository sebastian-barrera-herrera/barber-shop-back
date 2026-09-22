import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessId, Roles } from '../../common/decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Roles('OWNER', 'ADMIN')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Últimos avisos del panel y cuántos no se han leído' })
  list(@BusinessId() businessId: string) {
    return this.notifications.list(businessId);
  }

  @Post('read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar todos como leídos' })
  read(@BusinessId() businessId: string) {
    return this.notifications.markAllRead(businessId);
  }
}
