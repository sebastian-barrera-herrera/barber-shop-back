import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/auth-user';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { BusinessService } from '../business/business.service';
import { AppointmentsService } from './appointments.service';
import {
  AdminCreateAppointmentDto,
  CancelByTokenDto,
  ChangeStatusDto,
  ListAppointmentsQuery,
  PublicCreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

@ApiTags('Citas')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Citas con filtros (fecha, profesional, estado, servicio, búsqueda)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListAppointmentsQuery) {
    return this.appointments.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una cita' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.get(user, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Nueva cita (reserva manual)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: AdminCreateAppointmentDto) {
    return this.appointments.createManual(user, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Mover o editar una cita' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(user, id, dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar, empezar, completar, cancelar o marcar "no asistió"' })
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.appointments.changeStatus(user, id, dto);
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug/appointments')
export class PublicAppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly business: BusinessService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reservar una cita (sin cuenta)' })
  async create(@Param('slug') slug: string, @Body() dto: PublicCreateAppointmentDto) {
    return this.appointments.createPublic(await this.business.resolveSlug(slug), dto);
  }

  @Get('by-token/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ver mi cita (enlace privado)' })
  async byToken(@Param('slug') slug: string, @Param('token') token: string) {
    return this.appointments.getByToken(await this.business.resolveSlug(slug), token);
  }

  @Post('by-token/:token/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancelar mi cita' })
  async cancel(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() dto: CancelByTokenDto,
  ) {
    return this.appointments.cancelByToken(
      await this.business.resolveSlug(slug),
      token,
      dto.reason,
    );
  }
}
