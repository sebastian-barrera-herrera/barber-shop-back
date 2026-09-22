import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { BusinessId, Roles } from '../../common/decorators';
import { IsLocalDate } from '../../common/validation';
import { ReportsService } from './reports.service';

class RangeQuery {
  @ApiProperty({ example: '2026-09-01' }) @IsLocalDate() from!: string;
  @ApiProperty({ example: '2026-09-30' }) @IsLocalDate() to!: string;
}

@ApiTags('Reportes')
@ApiBearerAuth()
@Roles('OWNER', 'ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({
    summary: 'Citas realizadas y canceladas, ingresos, servicios y profesionales con más citas',
  })
  summary(@BusinessId() businessId: string, @Query() q: RangeQuery) {
    return this.reports.summary(businessId, q.from, q.to);
  }
}
