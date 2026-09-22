import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { professionalScope } from '../../common/access';
import type { AuthUser } from '../../common/auth-user';
import { addDays, toLocalDate, zonedToUtc } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_STATUSES } from '../appointments/status';
import { BusinessService } from '../business/business.service';

const REVENUE_DAYS = 7;
const POPULAR_DAYS = 30;

/**
 * Resumen del día para el panel. Todo en la zona horaria del negocio.
 * El profesional ve solo sus números.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly business: BusinessService,
  ) {}

  async summary(user: AuthUser, date?: string) {
    const { timezone } = await this.business.getSchedulingContext(user.bid);
    const day = date ?? toLocalDate(new Date(), timezone);
    const dayStart = zonedToUtc(day, 0, timezone);
    const dayEnd = zonedToUtc(addDays(day, 1), 0, timezone);
    const scope = professionalScope(user);
    const base: Prisma.AppointmentWhereInput = { businessId: user.bid, ...scope };
    const today: Prisma.AppointmentWhereInput = {
      ...base,
      startsAt: { gte: dayStart, lt: dayEnd },
    };

    const revenueFrom = zonedToUtc(addDays(day, -(REVENUE_DAYS - 1)), 0, timezone);
    const popularFrom = zonedToUtc(addDays(day, -(POPULAR_DAYS - 1)), 0, timezone);

    const [
      byStatus,
      completedSum,
      expectedSum,
      newCustomers,
      activeProfessionals,
      agenda,
      recent,
      popular,
    ] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['status'], where: today, _count: { _all: true } }),
      this.prisma.appointment.aggregate({
        where: { ...today, status: 'COMPLETED' },
        _sum: { priceCents: true },
      }),
      this.prisma.appointment.aggregate({
        where: { ...today, status: { in: ACTIVE_STATUSES } },
        _sum: { priceCents: true },
      }),
      this.prisma.customer.count({
        where: {
          businessId: user.bid,
          createdAt: { gte: dayStart, lt: dayEnd },
          ...(scope.professionalId
            ? { appointments: { some: { professionalId: scope.professionalId } } }
            : {}),
        },
      }),
      this.prisma.professional.count({
        where: { businessId: user.bid, isActive: true, deletedAt: null },
      }),
      this.prisma.appointment.findMany({
        where: { ...today, status: { not: 'CANCELLED' } },
        orderBy: { startsAt: 'asc' },
        omit: { accessTokenHash: true },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          professional: { select: { id: true, name: true, color: true } },
          service: { select: { id: true, name: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: { ...base, status: 'COMPLETED', startsAt: { gte: revenueFrom, lt: dayEnd } },
        select: { startsAt: true, priceCents: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['serviceId', 'serviceNameSnapshot'],
        where: {
          ...base,
          status: { in: ACTIVE_STATUSES },
          startsAt: { gte: popularFrom, lt: dayEnd },
        },
        _count: { _all: true },
        orderBy: { _count: { serviceId: 'desc' } },
        take: 5,
      }),
    ]);

    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const revenueByDay = Array.from({ length: REVENUE_DAYS }, (_, i) => {
      const date = addDays(day, i - (REVENUE_DAYS - 1));
      const items = recent.filter((r) => toLocalDate(r.startsAt, timezone) === date);
      return {
        date,
        revenueCents: items.reduce((sum, r) => sum + r.priceCents, 0),
        appointments: items.length,
      };
    });

    return {
      date: day,
      timezone,
      today: {
        appointments: ACTIVE_STATUSES.reduce((n, s) => n + count(s), 0),
        pending: count('PENDING'),
        completed: count('COMPLETED'),
        cancelled: count('CANCELLED'),
        noShow: count('NO_SHOW'),
        revenueCents: completedSum._sum.priceCents ?? 0,
        expectedRevenueCents: expectedSum._sum.priceCents ?? 0,
        newCustomers,
      },
      activeProfessionals,
      agenda,
      revenueByDay,
      popularServices: popular.map((p) => ({
        serviceId: p.serviceId,
        name: p.serviceNameSnapshot,
        count: p._count._all,
      })),
    };
  }
}
