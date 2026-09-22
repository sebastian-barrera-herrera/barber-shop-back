import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, daysBetween, toLocalDate, zonedToUtc } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessService } from '../business/business.service';

const MAX_DAYS = 366;

/** Reportes simples: lo que un negocio pequeño revisa cada semana o mes. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly business: BusinessService,
  ) {}

  async summary(businessId: string, from: string, to: string) {
    const span = daysBetween(from, to);
    if (span < 0) throw new BadRequestException('La fecha final debe ser posterior a la inicial');
    if (span >= MAX_DAYS) throw new BadRequestException('El rango puede ser de hasta un año');

    const { timezone } = await this.business.getSchedulingContext(businessId);
    const where: Prisma.AppointmentWhereInput = {
      businessId,
      startsAt: { gte: zonedToUtc(from, 0, timezone), lt: zonedToUtc(addDays(to, 1), 0, timezone) },
    };

    const [byStatus, completed, topServices, byProfessional, professionals] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.appointment.findMany({
        where: { ...where, status: 'COMPLETED' },
        select: { startsAt: true, priceCents: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['serviceNameSnapshot'],
        where: { ...where, status: { in: ['COMPLETED', 'CONFIRMED', 'PENDING', 'IN_PROGRESS'] } },
        _count: { _all: true },
        _sum: { priceCents: true },
        orderBy: { _count: { serviceNameSnapshot: 'desc' } },
        take: 8,
      }),
      this.prisma.appointment.groupBy({
        by: ['professionalId'],
        where: { ...where, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: { priceCents: true },
      }),
      this.prisma.professional.findMany({
        where: { businessId },
        select: { id: true, name: true, color: true },
      }),
    ]);

    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const revenueCents = completed.reduce((n, a) => n + a.priceCents, 0);
    const total = byStatus.reduce((n, b) => n + b._count._all, 0);

    return {
      from,
      to,
      totals: {
        appointments: total,
        completed: count('COMPLETED'),
        cancelled: count('CANCELLED'),
        noShow: count('NO_SHOW'),
        upcoming: count('PENDING') + count('CONFIRMED'),
        revenueCents,
        averageTicketCents: completed.length ? Math.round(revenueCents / completed.length) : 0,
        cancellationRate: total
          ? Math.round(((count('CANCELLED') + count('NO_SHOW')) / total) * 1000) / 10
          : 0,
      },
      byDay: Array.from({ length: span + 1 }, (_, i) => {
        const date = addDays(from, i);
        const items = completed.filter((a) => toLocalDate(a.startsAt, timezone) === date);
        return {
          date,
          revenueCents: items.reduce((n, a) => n + a.priceCents, 0),
          appointments: items.length,
        };
      }),
      topServices: topServices.map((s) => ({
        name: s.serviceNameSnapshot,
        count: s._count._all,
        revenueCents: s._sum.priceCents ?? 0,
      })),
      topProfessionals: byProfessional
        .map((p) => {
          const pro = professionals.find((x) => x.id === p.professionalId);
          return {
            professionalId: p.professionalId,
            name: pro?.name ?? '—',
            color: pro?.color ?? '#999999',
            completed: p._count._all,
            revenueCents: p._sum.priceCents ?? 0,
          };
        })
        .sort((a, b) => b.completed - a.completed),
    };
  }
}
