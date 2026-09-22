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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BusinessId, Public, Roles } from '../../common/decorators';
import { BusinessService } from '../business/business.service';
import { CreateServiceDto, ListServicesQuery, UpdateServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('Servicios')
@ApiBearerAuth()
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar servicios' })
  list(@BusinessId() businessId: string, @Query() query: ListServicesQuery) {
    return this.services.list(businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un servicio' })
  get(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.get(businessId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Agregar servicio' })
  create(@BusinessId() businessId: string, @Body() dto: CreateServiceDto) {
    return this.services.create(businessId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Editar servicio (precio, duración, pausar…)' })
  update(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Eliminar servicio (se conserva en el historial de citas)' })
  remove(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.remove(businessId, id);
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug')
export class PublicCatalogController {
  constructor(
    private readonly services: ServicesService,
    private readonly business: BusinessService,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Carta de servicios agrupada por categoría' })
  async catalog(@Param('slug') slug: string) {
    return this.services.publicCatalog(await this.business.resolveSlug(slug));
  }

  @Get('services')
  @ApiQuery({ name: 'category', required: false, description: 'slug de la categoría' })
  @ApiOperation({ summary: 'Servicios disponibles' })
  async list(@Param('slug') slug: string, @Query('category') category?: string) {
    return this.services.publicList(await this.business.resolveSlug(slug), category);
  }

  @Get('services/:serviceSlug')
  @ApiOperation({ summary: 'Detalle público de un servicio y quién lo realiza' })
  async detail(@Param('slug') slug: string, @Param('serviceSlug') serviceSlug: string) {
    return this.services.publicDetail(await this.business.resolveSlug(slug), serviceSlug);
  }
}
