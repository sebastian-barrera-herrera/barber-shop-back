import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { professionalScope } from '../../common/access';
import type { AuthUser } from '../../common/auth-user';
import { Page, paging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { BusinessService } from '../business/business.service';
import { CustomersService } from '../customers/customers.service';
import {
  AdminCreateAppointmentDto,
  ChangeStatusDto,
  ListAppointmentsQuery,
  PublicCreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';
import { canTransition, STATUS_LABEL } from './status';

type Db = Prisma.TransactionClient | PrismaService;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

const LIST_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  professional: { select: { id: true, name: true, color: true } },
  service: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

const DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, email: true, notes: true } },
  professional: { select: { id: true, name: true, color: true, photoUrl: true } },
  service: { select: { id: true, name: true, slug: true } },
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.AppointmentInclude;

const PUBLIC_INCLUDE = {
  customer: { select: { name: true } },
  professional: { select: { name: true, title: true, photoUrl: true } },
} satisfies Prisma.AppointmentInclude;

const TERMINAL = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const OVERLAP_MESSAGE = 'Esa hora acaba de ocuparse. Elige otra';

/** La restricción de exclusión de la BD rechazó la cita (otra reserva ganó la hora). */
function isOverlapError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes('appointments_no_overlap') || text.includes('23P01');
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly customers: CustomersService,
    private readonly business: BusinessService,
  ) {}

  // ───────────── Web pública ─────────────

  async createPublic(businessId: string, dto: PublicCreateAppointmentDto) {
    const biz = await this.business.getSchedulingContext(businessId);
    const token = newToken();
    const startsAt = new Date(dto.startsAt);

    const appointment = await this.withOverlapGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const slot = await this.availability.resolveSlot(
          tx,
          businessId,
          { serviceId: dto.serviceId, professionalId: dto.professionalId ?? undefined, startsAt },
          { requireGrid: true },
        );
        const customer = await this.customers.findOrCreate(
          tx,
          businessId,
          biz.country,
          dto.customer,
        );
        return tx.appointment.create({
          data: {
            businessId,
            customerId: customer.id,
            professionalId: slot.professionalId,
            serviceId: slot.service.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + slot.service.durationMinutes * 60_000),
            status: biz.settings.booking.autoConfirm ? 'CONFIRMED' : 'PENDING',
            source: 'WEB',
            serviceNameSnapshot: slot.service.name,
            priceCents: slot.service.priceCents,
            durationMinutes: slot.service.durationMinutes,
            notes: dto.notes,
            accessTokenHash: sha256(token),
          },
          include: PUBLIC_INCLUDE,
        });
      }),
    );

    return { appointment: this.presentPublic(appointment, biz), manageToken: token };
  }

  async getByToken(businessId: string, token: string) {
    const biz = await this.business.getSchedulingContext(businessId);
    return this.presentPublic(await this.findByToken(businessId, token), biz);
  }

  async cancelByToken(businessId: string, token: string, reason?: string) {
    const biz = await this.business.getSchedulingContext(businessId);
    const appt = await this.findByToken(businessId, token);
    if (!this.presentPublic(appt, biz).canCancel) {
      throw new BadRequestException('Ya no es posible cancelar en línea. Escríbenos y te ayudamos');
    }
    const updated = await this.prisma.appointment.update({
      where: { id: appt.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason ?? 'Cancelada por el cliente',
      },
      include: PUBLIC_INCLUDE,
    });
    return this.presentPublic(updated, biz);
  }

  // ───────────── Panel ─────────────

  async list(user: AuthUser, q: ListAppointmentsQuery): Promise<Page<unknown>> {
    const { page, pageSize, skip, take } = paging(q, 100);
    const scope = professionalScope(user);
    const where: Prisma.AppointmentWhereInput = {
      businessId: user.bid,
      ...(q.professionalId ? { professionalId: q.professionalId } : {}),
      ...scope, // el alcance del profesional siempre gana
      ...(q.serviceId ? { serviceId: q.serviceId } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.status?.length ? { status: { in: q.status } } : {}),
      ...(q.to ? { startsAt: { lt: new Date(q.to) } } : {}),
      ...(q.from ? { endsAt: { gt: new Date(q.from) } } : {}),
      ...(q.q
        ? {
            OR: [
              { customer: { name: { contains: q.q, mode: 'insensitive' } } },
              { serviceNameSnapshot: { contains: q.q, mode: 'insensitive' } },
              ...(q.q.replace(/\D/g, '').length >= 3
                ? [{ customer: { phone: { contains: q.q.replace(/\D/g, '') } } }]
                : []),
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip,
        take,
        include: LIST_INCLUDE,
        omit: { accessTokenHash: true },
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId: user.bid, ...professionalScope(user) },
      include: DETAIL_INCLUDE,
      omit: { accessTokenHash: true },
    });
    if (!appt) throw new NotFoundException('No encontramos esa cita');
    return appt;
  }

  async createManual(user: AuthUser, dto: AdminCreateAppointmentDto) {
    if (!dto.customerId && !dto.customer)
      throw new BadRequestException('Elige un cliente o escribe sus datos');
    const businessId = user.bid;
    const biz = await this.business.getSchedulingContext(businessId);
    const startsAt = new Date(dto.startsAt);
    const token = newToken();

    const created = await this.withOverlapGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const service = await this.resolveServiceForStaff(tx, businessId, {
          serviceId: dto.serviceId,
          professionalId: dto.professionalId,
          startsAt,
          allowOutsideHours: dto.allowOutsideHours,
        });
        const customer = dto.customerId
          ? await this.findCustomer(tx, businessId, dto.customerId)
          : await this.customers.findOrCreate(tx, businessId, biz.country, dto.customer!);

        return tx.appointment.create({
          data: {
            businessId,
            customerId: customer.id,
            professionalId: dto.professionalId,
            serviceId: service.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60_000),
            status: dto.status ?? 'CONFIRMED',
            source: 'ADMIN',
            serviceNameSnapshot: service.name,
            priceCents: service.priceCents,
            durationMinutes: service.durationMinutes,
            notes: dto.notes,
            internalNotes: dto.internalNotes,
            accessTokenHash: sha256(token),
          },
          include: DETAIL_INCLUDE,
          omit: { accessTokenHash: true },
        });
      }),
    );
    return { ...created, manageToken: token };
  }

  /** Mover (hora, profesional, servicio) o editar notas y pago. */
  async update(user: AuthUser, id: string, dto: UpdateAppointmentDto) {
    const current = await this.prisma.appointment.findFirst({
      where: { id, businessId: user.bid },
    });
    if (!current) throw new NotFoundException('No encontramos esa cita');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const professionalId = dto.professionalId ?? current.professionalId;
    const serviceId = dto.serviceId ?? current.serviceId;
    const moved =
      startsAt.getTime() !== current.startsAt.getTime() ||
      professionalId !== current.professionalId ||
      serviceId !== current.serviceId;

    if (moved && TERMINAL.includes(current.status)) {
      throw new BadRequestException(
        `No se puede mover una cita ${STATUS_LABEL[current.status].toLowerCase()}`,
      );
    }

    return this.withOverlapGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const data: Prisma.AppointmentUncheckedUpdateInput = {
          notes: dto.notes,
          internalNotes: dto.internalNotes,
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentStatus,
        };

        if (moved) {
          const service = await this.resolveServiceForStaff(tx, user.bid, {
            serviceId,
            professionalId,
            startsAt,
            allowOutsideHours: dto.allowOutsideHours,
            excludeAppointmentId: id,
          });
          const serviceChanged = serviceId !== current.serviceId;
          const duration = serviceChanged ? service.durationMinutes : current.durationMinutes;
          Object.assign(data, {
            startsAt,
            endsAt: new Date(startsAt.getTime() + duration * 60_000),
            professionalId,
            serviceId,
            ...(serviceChanged
              ? {
                  serviceNameSnapshot: service.name,
                  priceCents: service.priceCents,
                  durationMinutes: duration,
                }
              : {}),
          });
        }

        return tx.appointment.update({
          where: { id },
          data,
          include: DETAIL_INCLUDE,
          omit: { accessTokenHash: true },
        });
      }),
    );
  }

  async changeStatus(user: AuthUser, id: string, dto: ChangeStatusDto) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId: user.bid, ...professionalScope(user) },
    });
    if (!appt) throw new NotFoundException('No encontramos esa cita');
    if (appt.status === dto.status) return this.get(user, id);

    if (!canTransition(appt.status, dto.status)) {
      throw new BadRequestException(
        `Una cita "${STATUS_LABEL[appt.status]}" no puede pasar a "${STATUS_LABEL[dto.status]}"`,
      );
    }

    await this.prisma.appointment.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === 'CANCELLED'
          ? { cancelledAt: new Date(), cancelReason: dto.reason ?? 'Cancelada por el negocio' }
          : {}),
      },
    });
    return this.get(user, id);
  }

  // ───────────── helpers ─────────────

  /**
   * En el panel: con `allowOutsideHours` solo se valida que el profesional haga el servicio
   * (la BD igual impide cruces); si no, se usa el motor de disponibilidad sin cuadrícula.
   */
  private async resolveServiceForStaff(
    tx: Prisma.TransactionClient,
    businessId: string,
    req: {
      serviceId: string;
      professionalId: string;
      startsAt: Date;
      allowOutsideHours?: boolean;
      excludeAppointmentId?: string;
    },
  ) {
    if (!req.allowOutsideHours) {
      const slot = await this.availability.resolveSlot(tx, businessId, req, {
        requireGrid: false,
        ignoreAdvance: true,
        includeInactiveService: true,
        excludeAppointmentId: req.excludeAppointmentId,
      });
      return slot.service;
    }
    const service = await tx.service.findFirst({
      where: { id: req.serviceId, businessId, deletedAt: null },
      select: { id: true, name: true, durationMinutes: true, priceCents: true },
    });
    if (!service) throw new NotFoundException('Este servicio no está disponible');
    const offers = await tx.professionalService.count({
      where: {
        serviceId: req.serviceId,
        professional: { id: req.professionalId, businessId, deletedAt: null, isActive: true },
      },
    });
    if (!offers) throw new BadRequestException('Ese profesional no realiza este servicio');
    return service;
  }

  private async findCustomer(db: Db, businessId: string, id: string) {
    const customer = await db.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new BadRequestException('El cliente no existe');
    return customer;
  }

  private async findByToken(businessId: string, token: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { businessId, accessTokenHash: sha256(token) },
      include: PUBLIC_INCLUDE,
    });
    if (!appt) throw new NotFoundException('No encontramos esta cita. Revisa el enlace');
    return appt;
  }

  private async withOverlapGuard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isOverlapError(err)) throw new ConflictException(OVERLAP_MESSAGE);
      throw err;
    }
  }

  private presentPublic(
    appt: Prisma.AppointmentGetPayload<{ include: typeof PUBLIC_INCLUDE }>,
    biz: Awaited<ReturnType<BusinessService['getSchedulingContext']>>,
  ) {
    const deadline = new Date(
      appt.startsAt.getTime() - biz.settings.booking.cancellationWindowHours * 3_600_000,
    );
    return {
      id: appt.id,
      status: appt.status,
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      serviceName: appt.serviceNameSnapshot,
      durationMinutes: appt.durationMinutes,
      priceCents: appt.priceCents,
      currency: biz.currency,
      timezone: biz.timezone,
      notes: appt.notes,
      customer: { name: appt.customer.name },
      professional: appt.professional,
      canCancel: ['PENDING', 'CONFIRMED'].includes(appt.status) && new Date() < deadline,
      cancelDeadline: deadline,
    };
  }
}
