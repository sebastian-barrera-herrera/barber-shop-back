import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { uniqueSlug } from '../../common/utils/slug';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.category.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { services: { where: { deletedAt: null } } } } },
    });
  }

  async create(businessId: string, dto: CreateCategoryDto) {
    const slug = await this.slugFor(businessId, dto.name);
    return this.prisma.category.create({ data: { ...dto, slug, businessId } });
  }

  async update(businessId: string, id: string, dto: UpdateCategoryDto) {
    const current = await this.findOrFail(businessId, id);
    const slug =
      dto.name && dto.name !== current.name
        ? await this.slugFor(businessId, dto.name, id)
        : undefined;
    return this.prisma.category.update({ where: { id }, data: { ...dto, slug } });
  }

  /** Borrar una categoría no borra sus servicios: quedan "sin categoría". */
  async remove(businessId: string, id: string) {
    await this.findOrFail(businessId, id);
    await this.prisma.category.delete({ where: { id } });
  }

  /** Garantiza que la categoría pertenece al negocio (evita asignar categorías de otro tenant). */
  async assertInBusiness(businessId: string, id: string) {
    const found = await this.prisma.category.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('La categoría no existe');
  }

  private async findOrFail(businessId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, businessId } });
    if (!category) throw new NotFoundException('No encontramos esa categoría');
    return category;
  }

  private slugFor(businessId: string, name: string, exceptId?: string) {
    return uniqueSlug(
      name,
      async (slug) =>
        !!(await this.prisma.category.findFirst({
          where: { businessId, slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
          select: { id: true },
        })),
    );
  }
}
