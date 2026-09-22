import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessId, Public, Roles } from '../../common/decorators';
import { PaymentsService } from '../payments/payments.service';
import { BusinessService } from './business.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

@ApiTags('Negocio')
@ApiBearerAuth()
@Controller('business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  @ApiOperation({ summary: 'Datos del negocio y su configuración' })
  get(@BusinessId() businessId: string) {
    return this.business.get(businessId);
  }

  @Patch()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Actualizar datos del negocio' })
  update(@BusinessId() businessId: string, @Body() dto: UpdateBusinessDto) {
    return this.business.update(businessId, dto);
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug')
export class PublicBusinessController {
  constructor(
    private readonly business: BusinessService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('business')
  @ApiOperation({ summary: 'Perfil público del negocio (landing)' })
  async get(@Param('slug') slug: string) {
    const profile = await this.business.getPublicProfile(slug);
    const businessId = await this.business.resolveSlug(slug);
    return { ...profile, onlinePayments: await this.payments.onlinePaymentsEnabled(businessId) };
  }
}
