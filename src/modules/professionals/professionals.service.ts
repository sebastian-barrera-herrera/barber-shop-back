import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertNoNulls } from '../../common/utils/assert-no-nulls';
import { uniqueSlug } from '../../common/utils/slug';
import { hhmmToMinutes, minutesToHhmm } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../auth/password';
import {
  CreateAccountDto,
  CreateProfessionalDto,
  ListProfessionalsQuery,
  UpdateProfessionalDto,
} from './dto/professional.dto';
import { SetWorkingHoursDto } from './dto/schedule.dto';

const INCLUDE = {
  services: { select: { service: { select: { id: true, name: true, slug: true } } } },
  workingHours: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
  user: { select: { id: true, email: true, isActive: true } },
} satisfies Prisma.ProfessionalInclude;

type WithIncludes = Prisma.ProfessionalGetPayload<{ include: typeof INCLUDE }>;

export interface WeeklySchedule {
  weekday: number;
  ranges: { start: string; end: string }[];
}

/** Filas de WorkingHours → semana completa (7 días, vacío = descanso). */
export function toWeeklySchedule(
  rows: { weekday: number; startMinute: number; endMinute: number }[],
): WeeklySchedule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    ranges: rows
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((r) => ({ start: minutesToHhmm(r.startMinute), end: minutesToHhmm(r.endMinute) })),
  }));
}

@Injectable()
export class ProfessionalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, query: ListProfessionalsQuery = {}) {
    const rows = await this.prisma.professional.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(query.includeInactive === false ? { isActive: true } : {}),
        ...(query.serviceId ? { services: { some: { serviceId: query.serviceId } } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: INCLUDE,
    });
    return rows.map((p) => this.present(p));
  }

  async get(businessId: string, id: string) {
    return this.present(await this.findOrFail(businessId, id));
  }

  async create(businessId: string, dto: CreateProfessionalDto) {
    const { serviceIds, social, ...data } = dto;
    if (serviceIds?.length) await this.assertServicesInBusiness(businessId, serviceIds);
    const slug = await this.slugFor(businessId, dto.name);
    const created = await this.prisma.professional.create({
      data: {
        ...data,
        social: social ? { ...social } : undefined,
        slug,
        businessId,
        services: serviceIds?.length
          ? { create: [...new Set(serviceIds)].map((serviceId) => ({ serviceId })) }
          : undefined,
      },
      include: INCLUDE,
    });
    return this.present(created);
  }

  async update(businessId: string, id: string, dto: UpdateProfessionalDto) {
    assertNoNulls(dto, ['name', 'isActive', 'sortOrder', 'color']);
    const current = await this.findOrFail(businessId, id);
    const { social, ...data } = dto;
    const slug =
      dto.name && dto.name !== current.name
        ? await this.slugFor(businessId, dto.name, id)
        : undefined;
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { ...data, ...(social !== undefined ? { social: { ...social } } : {}), slug },
      include: INCLUDE,
    });
    return this.present(updated);
  }

  /**
   * Borrado suave. Si tiene citas próximas se pide resolverlas primero,
   * para no dejar clientes con citas "huérfanas".
   */
  async remove(businessId: string, id: string) {
    const current = await this.findOrFail(businessId, id);
    const upcoming = await this.prisma.appointment.count({
      where: {
        professionalId: id,
        startsAt: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      },
    });
    if (upcoming > 0) {
      throw new ConflictException(
        `${current.name} tiene ${upcoming} cita(s) próxima(s). Reasígnalas o cancélalas antes de eliminarlo.`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.professionalService.deleteMany({ where: { professionalId: id } }),
      this.prisma.professional.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          slug: `${current.slug}--${id.slice(0, 8)}`,
        },
      }),
      ...(current.userId
        ? [this.prisma.user.update({ where: { id: current.userId }, data: { isActive: false } })]
        : []),
    ]);
  }

  async setServices(businessId: string, id: string, serviceIds: string[]) {
    await this.findOrFail(businessId, id);
    const unique = [...new Set(serviceIds)];
    await this.assertServicesInBusiness(businessId, unique);
    await this.prisma.$transaction([
      this.prisma.professionalService.deleteMany({ where: { professionalId: id } }),
      this.prisma.professionalService.createMany({
        data: unique.map((serviceId) => ({ professionalId: id, serviceId })),
      }),
    ]);
    return this.get(businessId, id);
  }

  async getWorkingHours(businessId: string, id: string) {
    const p = await this.findOrFail(businessId, id);
    return toWeeklySchedule(p.workingHours);
  }

  async setWorkingHours(businessId: string, id: string, dto: SetWorkingHoursDto) {
    await this.findOrFail(businessId, id);
    const weekdays = dto.days.map((d) => d.weekday);
    if (new Set(weekdays).size !== weekdays.length)
      throw new BadRequestException('Hay días repetidos');

    const rows = dto.days.flatMap((day) => {
      const ranges = day.ranges
        .map((r) => ({ startMinute: hhmmToMinutes(r.start), endMinute: hhmmToMinutes(r.end) }))
        .sort((a, b) => a.startMinute - b.startMinute);
      ranges.forEach((r, i) => {
        if (r.endMinute <= r.startMinute) {
          throw new BadRequestException('La hora de salida debe ser posterior a la de entrada');
        }
        if (i > 0 && r.startMinute < ranges[i - 1].endMinute) {
          throw new BadRequestException('Las franjas de un mismo día no pueden cruzarse');
        }
      });
      return ranges.map((r) => ({ ...r, weekday: day.weekday, professionalId: id }));
    });

    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { professionalId: id } }),
      this.prisma.workingHours.createMany({ data: rows }),
    ]);
    return this.getWorkingHours(businessId, id);
  }

  /** Crea el usuario con el que el profesional entra al panel. */
  async createAccount(businessId: string, id: string, dto: CreateAccountDto) {
    const p = await this.findOrFail(businessId, id);
    if (p.userId) throw new ConflictException(`${p.name} ya tiene un usuario`);
    const passwordHash = await hashPassword(dto.password);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { businessId, email: dto.email, passwordHash, name: p.name, role: 'PROFESSIONAL' },
      });
      await tx.professional.update({ where: { id }, data: { userId: user.id } });
    });
    return this.get(businessId, id);
  }

  // ───────────── Público ─────────────

  async publicList(businessId: string, serviceId?: string) {
    const rows = await this.prisma.professional.findMany({
      where: {
        businessId,
        deletedAt: null,
        isActive: true,
        ...(serviceId ? { services: { some: { serviceId } } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        title: true,
        bio: true,
        photoUrl: true,
        specialties: true,
        social: true,
        services: {
          where: { service: { deletedAt: null, isActive: true } },
          select: { service: { select: { id: true, slug: true, name: true } } },
        },
      },
    });
    return rows.map(({ services, ...p }) => ({ ...p, services: services.map((s) => s.service) }));
  }

  // ───────────── helpers ─────────────

  async findOrFail(businessId: string, id: string): Promise<WithIncludes> {
    const p = await this.prisma.professional.findFirst({
      where: { id, businessId, deletedAt: null },
      include: INCLUDE,
    });
    if (!p) throw new NotFoundException('No encontramos ese profesional');
    return p;
  }

  private present(p: WithIncludes) {
    const { services, workingHours, user, ...rest } = p;
    return {
      ...rest,
      services: services.map((s) => s.service),
      workingHours: toWeeklySchedule(workingHours),
      account: user ? { email: user.email, isActive: user.isActive } : null,
    };
  }

  private async assertServicesInBusiness(businessId: string, serviceIds: string[]) {
    const count = await this.prisma.service.count({
      where: { id: { in: serviceIds }, businessId, deletedAt: null },
    });
    if (count !== new Set(serviceIds).size)
      throw new BadRequestException('Alguno de los servicios no existe');
  }

  private slugFor(businessId: string, name: string, exceptId?: string) {
    return uniqueSlug(
      name,
      async (slug) =>
        !!(await this.prisma.professional.findFirst({
          where: { businessId, slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
          select: { id: true },
        })),
    );
  }
}
