import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsString, Length } from 'class-validator';
import { isStaffAdmin, professionalScope } from '../../common/access';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators';
import { Trim } from '../../common/validation';
import { PrismaService } from '../../prisma/prisma.service';

const LIMIT = 5;

/** Buscador del panel: clientes, citas, profesionales y servicios en una sola consulta. */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: AuthUser, q: string) {
    const text = { contains: q, mode: 'insensitive' as const };
    const digits = q.replace(/\D/g, '');
    const scope = professionalScope(user);
    const customerMatch: Prisma.CustomerWhereInput = {
      OR: [
        { name: text },
        { email: text },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    };

    const [customers, appointments, professionals, services] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          businessId: user.bid,
          ...customerMatch,
          ...(scope.professionalId
            ? { appointments: { some: { professionalId: scope.professionalId } } }
            : {}),
        },
        take: LIMIT,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, phone: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          businessId: user.bid,
          ...scope,
          OR: [{ customer: customerMatch }, { serviceNameSnapshot: text }],
        },
        take: LIMIT,
        orderBy: { startsAt: 'desc' },
        select: {
          id: true,
          startsAt: true,
          status: true,
          serviceNameSnapshot: true,
          customer: { select: { name: true } },
          professional: { select: { name: true } },
        },
      }),
      isStaffAdmin(user)
        ? this.prisma.professional.findMany({
            where: { businessId: user.bid, deletedAt: null, name: text },
            take: LIMIT,
            select: { id: true, name: true, title: true },
          })
        : [],
      this.prisma.service.findMany({
        where: { businessId: user.bid, deletedAt: null, name: text },
        take: LIMIT,
        select: { id: true, name: true, priceCents: true, durationMinutes: true },
      }),
    ]);
    return { customers, appointments, professionals, services };
  }
}

class SearchQuery {
  @ApiProperty({ example: 'juan' })
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'Escribe al menos 2 letras' })
  q!: string;
}

@ApiTags('Búsqueda')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar clientes, citas, profesionales y servicios' })
  search(@CurrentUser() user: AuthUser, @Query() query: SearchQuery) {
    return this.searchService.search(user, query.q);
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
