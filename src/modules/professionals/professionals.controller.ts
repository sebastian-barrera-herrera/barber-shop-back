import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { assertCanManageProfessional } from '../../common/access';
import type { AuthUser } from '../../common/auth-user';
import { BusinessId, CurrentUser, Public, Roles } from '../../common/decorators';
import { BusinessService } from '../business/business.service';
import {
  InviteProfessionalDto,
  UpdateAccessDto,
  CreateProfessionalDto,
  ListProfessionalsQuery,
  SetServicesDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';
import { CreateTimeOffDto, ListTimeOffQuery, SetWorkingHoursDto } from './dto/schedule.dto';
import { ProfessionalsService } from './professionals.service';
import { TimeOffService } from './time-off.service';

@ApiTags('Profesionales')
@ApiBearerAuth()
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar profesionales' })
  list(@BusinessId() businessId: string, @Query() query: ListProfessionalsQuery) {
    return this.professionals.list(businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un profesional' })
  get(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.professionals.get(businessId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Agregar profesional' })
  create(@BusinessId() businessId: string, @Body() dto: CreateProfessionalDto) {
    return this.professionals.create(businessId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Editar profesional' })
  update(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfessionalDto,
  ) {
    return this.professionals.update(businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Eliminar profesional (debe no tener citas próximas)' })
  remove(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.professionals.remove(businessId, id);
  }

  @Put(':id/services')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Definir qué servicios realiza' })
  setServices(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetServicesDto,
  ) {
    return this.professionals.setServices(businessId, id, dto.serviceIds);
  }

  @Get(':id/working-hours')
  @ApiOperation({ summary: 'Horario semanal' })
  getWorkingHours(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.professionals.getWorkingHours(businessId, id);
  }

  @Put(':id/working-hours')
  @ApiOperation({ summary: 'Definir horario semanal (el profesional puede editar el suyo)' })
  setWorkingHours(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetWorkingHoursDto,
  ) {
    assertCanManageProfessional(user, id);
    return this.professionals.setWorkingHours(user.bid, id, dto);
  }

  @Post(':id/invite')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Invitar al profesional al panel (elige su contraseña por correo)' })
  invite(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteProfessionalDto,
  ) {
    return this.professionals.invite(businessId, id, dto);
  }

  @Post(':id/invite/resend')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Volver a enviar la invitación' })
  resendInvite(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.professionals.resendInvitation(businessId, id);
  }

  @Delete(':id/access')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Quitarle el acceso al panel' })
  revokeAccess(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.professionals.revokeAccess(businessId, id);
  }

  @Patch(':id/access')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Qué secciones ve el profesional en el panel' })
  updateAccess(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccessDto,
  ) {
    return this.professionals.updateAccess(businessId, id, dto.access);
  }
}

@ApiTags('Bloqueos de horario')
@ApiBearerAuth()
@Controller('time-off')
export class TimeOffController {
  constructor(private readonly timeOff: TimeOffService) {}

  @Get()
  @ApiOperation({ summary: 'Bloqueos vigentes (vacaciones, cierres, citas personales)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListTimeOffQuery) {
    return this.timeOff.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Bloquear un horario' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTimeOffDto) {
    return this.timeOff.create(user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quitar un bloqueo' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.timeOff.remove(user, id);
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug/professionals')
export class PublicProfessionalsController {
  constructor(
    private readonly professionals: ProfessionalsService,
    private readonly business: BusinessService,
  ) {}

  @Get()
  @ApiQuery({
    name: 'serviceId',
    required: false,
    description: 'Solo quienes realizan este servicio',
  })
  @ApiOperation({ summary: 'Equipo del negocio' })
  async list(
    @Param('slug') slug: string,
    @Query('serviceId', new ParseUUIDPipe({ optional: true })) serviceId?: string,
  ) {
    return this.professionals.publicList(await this.business.resolveSlug(slug), serviceId);
  }
}
