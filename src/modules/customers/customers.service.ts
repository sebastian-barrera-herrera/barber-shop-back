import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isStaffAdmin, professionalScope } from '../../common/access';
import type { AuthUser } from '../../common/auth-user';
import { Page, PageQuery, paging } from '../../common/pagination';
import { assertNoNulls } from '../../common/utils/assert-no-nulls';
import { normalizePhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_STATUSES } from '../appointments/status';
import { BusinessService } from '../business/business.service';
import {
  CreateCustomerDto,
  CustomerContactDto,
  ListCustomersQuery,
  UpdateCustomerDto,
} from './dto/customer.dto';

type Db = Prisma.TransactionClient | PrismaService;

const PHONE_ERROR = 'Ese teléfono no parece válido. Revisa el número';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly business: BusinessService,
  ) {}

  /**
   * Reserva sin cuenta: el cliente se identifica por su teléfono dentro del negocio.
   * Si ya existe se reutiliza (no se pisan los datos que el negocio ya tiene; solo se completa el correo).
   */
  async findOrCreate(db: Db, businessId: string, country: string, contact: CustomerContactDto) {
    const phone = normalizePhone(contact.phone, country);
    if (!phone) throw new BadRequestException(PHONE_ERROR);

    const existing = await db.customer.findUnique({
      where: { businessId_phone: { businessId, phone } },
    });
    if (existing) {
      if (!existing.email && contact.email) {
        return db.customer.update({ where: { id: existing.id }, data: { email: contact.email } });
      }
      return existing;
    }
    return db.customer.create({
      data: { businessId, phone, name: contact.name, email: contact.email },
    });
  }

  async list(user: AuthUser, query: ListCustomersQuery): Promise<Page<unknown>> {
    const { page, pageSize, skip, take } = paging(query);
    const scope = professionalScope(user);
    const where: Prisma.CustomerWhereInput = {
      businessId: user.bid,
      ...(scope.professionalId
        ? { appointments: { some: { professionalId: scope.professionalId } } }
        : {}),
      ...(query.q ? { OR: this.searchFilter(query.q) } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        include: { _count: { select: { appointments: true } } },
      }),
    ]);

    const last = rows.length
      ? await this.prisma.appointment.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: rows.map((r) => r.id) },
            status: { in: ACTIVE_STATUSES },
            startsAt: { lte: new Date() },
          },
          _max: { startsAt: true },
        })
      : [];

    return {
      items: rows.map(({ _count, ...c }) => ({
        ...c,
        appointmentsCount: _count.appointments,
        lastAppointmentAt: last.find((l) => l.customerId === c.id)?._max.startsAt ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async get(user: AuthUser, id: string) {
    const customer = await this.findVisible(user, id);
    const now = new Date();
    const [byStatus, spent, lastVisit, next] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { customerId: id },
        _count: { _all: true },
      }),
      this.prisma.appointment.aggregate({
        where: { customerId: id, status: 'COMPLETED' },
        _sum: { priceCents: true },
      }),
      this.prisma.appointment.findFirst({
        where: { customerId: id, status: { in: ACTIVE_STATUSES }, startsAt: { lte: now } },
        orderBy: { startsAt: 'desc' },
        select: { startsAt: true },
      }),
      this.prisma.appointment.findFirst({
        where: { customerId: id, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          startsAt: true,
          serviceNameSnapshot: true,
          professional: { select: { name: true } },
        },
      }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;

    return {
      ...customer,
      stats: {
        appointments: byStatus.reduce((acc, b) => acc + b._count._all, 0),
        completed: count('COMPLETED'),
        cancelled: count('CANCELLED'),
        noShow: count('NO_SHOW'),
        totalSpentCents: spent._sum.priceCents ?? 0,
        lastAppointmentAt: lastVisit?.startsAt ?? null,
      },
      nextAppointment: next,
    };
  }

  async appointments(user: AuthUser, id: string, query: PageQuery) {
    await this.findVisible(user, id);
    const { page, pageSize, skip, take } = paging(query, 20);
    const where: Prisma.AppointmentWhereInput = { customerId: id, ...professionalScope(user) };
    const [total, items] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          serviceNameSnapshot: true,
          priceCents: true,
          professional: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async create(businessId: string, dto: CreateCustomerDto) {
    const { country } = await this.business.getSchedulingContext(businessId);
    const phone = normalizePhone(dto.phone, country);
    if (!phone) throw new BadRequestException(PHONE_ERROR);
    await this.assertPhoneFree(businessId, phone);
    return this.prisma.customer.create({ data: { ...dto, phone, businessId } });
  }

  async update(businessId: string, id: string, dto: UpdateCustomerDto) {
    assertNoNulls(dto, ['name', 'phone']);
    await this.findOrFail(businessId, id);
    let phone: string | undefined;
    if (dto.phone) {
      const { country } = await this.business.getSchedulingContext(businessId);
      phone = normalizePhone(dto.phone, country) ?? undefined;
      if (!phone) throw new BadRequestException(PHONE_ERROR);
      await this.assertPhoneFree(businessId, phone, id);
    }
    return this.prisma.customer.update({ where: { id }, data: { ...dto, phone } });
  }

  /** Solo se puede borrar un cliente sin citas (el historial no se pierde). */
  async remove(businessId: string, id: string) {
    await this.findOrFail(businessId, id);
    const appointments = await this.prisma.appointment.count({ where: { customerId: id } });
    if (appointments > 0) {
      throw new ConflictException('Este cliente tiene citas registradas; no se puede eliminar');
    }
    await this.prisma.customer.delete({ where: { id } });
  }

  // ───────────── helpers ─────────────

  private searchFilter(q: string): Prisma.CustomerWhereInput[] {
    const digits = q.replace(/\D/g, '');
    return [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }

  private async findOrFail(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundException('No encontramos ese cliente');
    return customer;
  }

  /** El profesional solo ve clientes que han reservado con él. */
  private async findVisible(user: AuthUser, id: string) {
    const scope = professionalScope(user);
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        businessId: user.bid,
        ...(isStaffAdmin(user)
          ? {}
          : { appointments: { some: { professionalId: scope.professionalId } } }),
      },
    });
    if (!customer) throw new NotFoundException('No encontramos ese cliente');
    return customer;
  }

  private async assertPhoneFree(businessId: string, phone: string, exceptId?: string) {
    const other = await this.prisma.customer.findFirst({
      where: { businessId, phone, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { name: true },
    });
    if (other) throw new ConflictException(`Ya hay un cliente con ese teléfono: ${other.name}`);
  }
}
