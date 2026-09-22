import { Global, Module } from '@nestjs/common';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { NOTIFICATION_CHANNELS } from './channels/notification-channel';
import { MAIL_TRANSPORT, SmtpTransport } from './email/mail-transport';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    InAppChannel,
    EmailChannel,
    SmtpTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpTransport },
    // Registro de canales: agregar aquí WhatsAppChannel, SmsChannel, PushChannel.
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (inApp: InAppChannel, email: EmailChannel) => [inApp, email],
      inject: [InAppChannel, EmailChannel],
    },
    NotificationsService,
    RemindersService,
  ],
  exports: [NotificationsService, RemindersService],
})
export class NotificationsModule {}
