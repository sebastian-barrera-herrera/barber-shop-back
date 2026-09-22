import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertNoNulls } from '../../common/utils/assert-no-nulls';
import { uniqueSlug } from '../../common/utils/slug';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateServiceDto, ListServicesQuery, UpdateServiceDto } from './dto/service.dto';

const ADMIN_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  _count: { select: { professionals: true } },
} satisfies Prisma.ServiceInclude;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  list(businessId: string, query: ListServicesQuery = {}) {
    return this.prisma.service.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.includeInactive === false ? { isActive: true } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: ADMIN_INCLUDE,
    });
  }

  async get(businessId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        ...ADMIN_INCLUDE,
        professionals: {
          select: { professional: { select: { id: true, name: true, photoUrl: true } } },
        },
      },
    });
    if (!service) throw new NotFoundException('No encontramos ese servicio');
    return service;
  }

  async create(businessId: string, dto: CreateServiceDto) {
    if (dto.categoryId) await this.categories.assertInBusiness(businessId, dto.categoryId);
    const slug = await this.slugFor(businessId, dto.name);
    return this.prisma.service.create({
      data: { ...dto, slug, businessId },
      include: ADMIN_INCLUDE,
    });
  }

  async update(businessId: string, id: string, dto: UpdateServiceDto) {
    assertNoNulls(dto, ['name', 'priceCents', 'durationMinutes', 'isActive', 'sortOrder']);
    const current = await this.findOrFail(businessId, id);
    if (dto.categoryId) await this.categories.assertInBusiness(businessId, dto.categoryId);
    const slug =
      dto.name && dto.name !== current.name
        ? await this.slugFor(businessId, dto.name, id)
        : undefined;
    return this.prisma.service.update({
      where: { id },
      data: { ...(dto as Prisma.ServiceUncheckedUpdateInput), slug },
      include: ADMIN_INCLUDE,
    });
  }

  /**
   * Borrado suave: las citas pasadas conservan su servicio para el historial.
   * Se libera el slug y se quita de los profesionales para que no aparezca en reservas.
   */
  async remove(businessId: string, id: string) {
    const current = await this.findOrFail(businessId, id);
    await this.prisma.$transaction([
      this.prisma.professionalService.deleteMany({ where: { serviceId: id } }),
      this.prisma.service.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          slug: `${current.slug}--${id.slice(0, 8)}`,
        },
      }),
    ]);
  }

  // ───────────── Catálogo público ─────────────

  private readonly publicSelect = {
    id: true,
    slug: true,
    name: true,
    description: true,
    priceCents: true,
    durationMinutes: true,
    imageUrl: true,
    category: { select: { slug: true, name: true } },
  } satisfies Prisma.ServiceSelect;

  private publicWhere(businessId: string): Prisma.ServiceWhereInput {
    return {
      businessId,
      deletedAt: null,
      isActive: true,
      OR: [{ categoryId: null }, { category: { isActive: true } }],
    };
  }

  /** Carta de servicios agrupada por categoría, en el orden definido por el negocio. */
  async publicCatalog(businessId: string) {
    const [categories, uncategorized] = await Promise.all([
      this.prisma.category.findMany({
        where: { businessId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          slug: true,
          name: true,
          description: true,
          services: {
            where: { deletedAt: null, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: this.publicSelect,
          },
        },
      }),
      this.prisma.service.findMany({
        where: { businessId, deletedAt: null, isActive: true, categoryId: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: this.publicSelect,
      }),
    ]);
    const groups = categories.filter((c) => c.services.length > 0);
    if (uncategorized.length) {
      groups.push({ slug: 'otros', name: 'Otros', description: null, services: uncategorized });
    }
    return groups;
  }

  publicList(businessId: string, categorySlug?: string) {
    return this.prisma.service.findMany({
      where: {
        ...this.publicWhere(businessId),
        ...(categorySlug ? { category: { slug: categorySlug, isActive: true } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: this.publicSelect,
    });
  }

  async publicDetail(businessId: string, slug: string) {
    const service = await this.prisma.service.findFirst({
      where: { ...this.publicWhere(businessId), slug },
      select: {
        ...this.publicSelect,
        professionals: {
          where: { professional: { isActive: true, deletedAt: null } },
          select: {
            professional: {
              select: { id: true, slug: true, name: true, title: true, photoUrl: true },
            },
          },
        },
      },
    });
    if (!service) throw new NotFoundException('Este servicio no está disponible');
    const { professionals, ...rest } = service;
    return { ...rest, professionals: professionals.map((p) => p.professional) };
  }

  // ───────────── helpers ─────────────

  private async findOrFail(businessId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!service) throw new NotFoundException('No encontramos ese servicio');
    return service;
  }

  private slugFor(businessId: string, name: string, exceptId?: string) {
    return uniqueSlug(
      name,
      async (slug) =>
        !!(await this.prisma.service.findFirst({
          where: { businessId, slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
          select: { id: true },
        })),
    );
  }
}
