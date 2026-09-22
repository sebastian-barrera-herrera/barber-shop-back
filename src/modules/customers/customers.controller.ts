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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user';
import { BusinessId, CurrentUser, Roles } from '../../common/decorators';
import { PageQuery } from '../../common/pagination';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ListCustomersQuery, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar clientes (el profesional ve solo los suyos)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListCustomersQuery) {
    return this.customers.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha del cliente con resumen de visitas' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(user, id);
  }

  @Get(':id/appointments')
  @ApiOperation({ summary: 'Historial de citas del cliente' })
  appointments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQuery,
  ) {
    return this.customers.appointments(user, id, query);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Agregar cliente' })
  create(@BusinessId() businessId: string, @Body() dto: CreateCustomerDto) {
    return this.customers.create(businessId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Editar cliente (datos y notas)' })
  update(
    @BusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Eliminar cliente (solo si no tiene citas)' })
  remove(@BusinessId() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.remove(businessId, id);
  }
}
