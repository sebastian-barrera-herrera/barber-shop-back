import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { NotificationChannel, OutgoingNotification } from './notification-channel';

/** Avisos dentro del panel ("Nueva reserva", "Nuevo mensaje"). */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'in-app';

  constructor(private readonly prisma: PrismaService) {}

  supports(n: OutgoingNotification) {
    return n.audience === 'STAFF';
  }

  async send(n: OutgoingNotification) {
    await this.prisma.notification.create({
      data: {
        businessId: n.businessId,
        type: n.type,
        title: n.title,
        body: n.body,
        data: (n.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
