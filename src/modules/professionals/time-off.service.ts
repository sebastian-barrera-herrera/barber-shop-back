import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertCanManageProfessional, isStaffAdmin } from '../../common/access';
import type { AuthUser } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_STATUSES } from '../appointments/status';
import { CreateTimeOffDto, ListTimeOffQuery } from './dto/schedule.dto';

const MAX_SPAN_MS = 366 * 86_400_000;

@Injectable()
export class TimeOffService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, query: ListTimeOffQuery) {
    const professionalFilter = isStaffAdmin(user)
      ? query.professionalId
        ? { OR: [{ professionalId: query.professionalId }, { professionalId: null }] }
        : {}
      : { OR: [{ professionalId: user.pid ?? '' }, { professionalId: null }] };

    return this.prisma.timeOff.findMany({
      where: {
        businessId: user.bid,
        ...professionalFilter,
        ...(query.to ? { startsAt: { lt: new Date(query.to) } } : {}),
        endsAt: { gt: query.from ? new Date(query.from) : new Date() },
      },
      orderBy: { startsAt: 'asc' },
      include: { professional: { select: { id: true, name: true } } },
    });
  }

  /**
   * Crea un bloqueo. No cancela citas existentes: devuelve cuántas quedan dentro
   * para que el panel avise ("Tienes 2 citas en ese horario").
   */
  async create(user: AuthUser, dto: CreateTimeOffDto) {
    // Un cierre de todo el negocio (null) es solo para dueño/admin.
    // Si un profesional no indica a quién aplica, el bloqueo es suyo.
    const professionalId = dto.professionalId ?? (isStaffAdmin(user) ? null : (user.pid ?? null));
    assertCanManageProfessional(user, professionalId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('El fin debe ser posterior al inicio');
    if (endsAt.getTime() - startsAt.getTime() > MAX_SPAN_MS) {
      throw new BadRequestException('Un bloqueo puede durar máximo un año');
    }

    if (professionalId) {
      const exists = await this.prisma.professional.count({
        where: { id: professionalId, businessId: user.bid, deletedAt: null },
      });
      if (!exists) throw new BadRequestException('El profesional no existe');
    }

    const timeOff = await this.prisma.timeOff.create({
      data: { businessId: user.bid, professionalId, startsAt, endsAt, reason: dto.reason },
    });
    const conflictingAppointments = await this.prisma.appointment.count({
      where: {
        businessId: user.bid,
        ...(professionalId ? { professionalId } : {}),
        status: { in: ACTIVE_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    return { ...timeOff, conflictingAppointments };
  }

  async remove(user: AuthUser, id: string) {
    const timeOff = await this.prisma.timeOff.findFirst({ where: { id, businessId: user.bid } });
    if (!timeOff) throw new NotFoundException('No encontramos ese bloqueo');
    assertCanManageProfessional(user, timeOff.professionalId);
    await this.prisma.timeOff.delete({ where: { id } });
  }
}
