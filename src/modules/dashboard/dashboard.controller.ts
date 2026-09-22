import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators';
import { IsLocalDate } from '../../common/validation';
import { DashboardService } from './dashboard.service';

class SummaryQuery {
  @ApiPropertyOptional({
    example: '2026-09-22',
    description: 'Por defecto, hoy en la zona del negocio',
  })
  @IsOptional()
  @IsLocalDate()
  date?: string;
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Resumen del día: citas, ingresos, pendientes, agenda y servicios populares',
  })
  summary(@CurrentUser() user: AuthUser, @Query() q: SummaryQuery) {
    return this.dashboard.summary(user, q.date);
  }
}
