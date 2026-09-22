import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { BusinessId, Public } from '../../common/decorators';
import { IsLocalDate } from '../../common/validation';
import { BusinessService } from '../business/business.service';
import { AvailabilityService } from './availability.service';

export class DayQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID() serviceId!: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Vacío = cualquier profesional' })
  @IsOptional()
  @IsUUID()
  professionalId?: string;
  @ApiProperty({ example: '2026-09-25' }) @IsLocalDate() date!: string;
}

export class RangeQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID() serviceId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() professionalId?: string;
  @ApiProperty({ example: '2026-09-01' }) @IsLocalDate() from!: string;
  @ApiProperty({ example: '2026-09-30' }) @IsLocalDate() to!: string;
}

@ApiTags('Disponibilidad')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Horas libres de un día (panel: sin límites de anticipación)' })
  day(@BusinessId() businessId: string, @Query() q: DayQuery) {
    return this.availability.getDaySlots(businessId, q, {
      ignoreAdvance: true,
      includeInactiveService: true,
    });
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug/availability')
export class PublicAvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly business: BusinessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Horas disponibles para reservar un servicio en una fecha' })
  async day(@Param('slug') slug: string, @Query() q: DayQuery) {
    return this.availability.getDaySlots(await this.business.resolveSlug(slug), q);
  }

  @Get('days')
  @ApiOperation({ summary: 'Días con cupo en un rango (máx. 62 días)' })
  async days(@Param('slug') slug: string, @Query() q: RangeQuery) {
    return this.availability.getDays(await this.business.resolveSlug(slug), q);
  }
}
