import { Global, Module } from '@nestjs/common';
import { InAppChannel } from './channels/in-app.channel';
import { NOTIFICATION_CHANNELS } from './channels/notification-channel';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    InAppChannel,
    // Registro de canales: agregar aquí EmailChannel, WhatsAppChannel, SmsChannel, PushChannel.
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (inApp: InAppChannel) => [inApp],
      inject: [InAppChannel],
    },
    NotificationsService,
    RemindersService,
  ],
  exports: [NotificationsService, RemindersService],
})
export class NotificationsModule {}
