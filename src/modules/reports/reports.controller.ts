import type { AuthUser } from '../../common/auth-user';
import { assertCanSee } from '../../common/access';
import { CurrentUser } from '../../common/decorators';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsLocalDate } from '../../common/validation';
import { ReportsService } from './reports.service';

class RangeQuery {
  @ApiProperty({ example: '2026-09-01' }) @IsLocalDate() from!: string;
  @ApiProperty({ example: '2026-09-30' }) @IsLocalDate() to!: string;
}

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({
    summary: 'Citas realizadas y canceladas, ingresos, servicios y profesionales con más citas',
  })
  summary(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    assertCanSee(user, 'reports');
    return this.reports.summary(user.bid, q.from, q.to);
  }
}
