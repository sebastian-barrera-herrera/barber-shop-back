import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BusinessId, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { SECTION_SCHEMAS, SettingsService, type Section } from './settings.service';

@ApiTags('Configuración')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Configuración del negocio (marca, redes, horario, reservas)' })
  get(@BusinessId() businessId: string) {
    return this.settings.get(businessId);
  }

  @Patch(':section')
  @Roles('OWNER')
  @ApiParam({ name: 'section', enum: Object.keys(SECTION_SCHEMAS) })
  @ApiBody({ schema: { type: 'object' } })
  @ApiOperation({ summary: 'Actualizar una sección' })
  update(
    @BusinessId() businessId: string,
    @Param('section') section: string,
    @Body() body: unknown,
  ) {
    if (!(section in SECTION_SCHEMAS)) throw new NotFoundException('Sección desconocida');
    const s = section as Section;
    const data = new ZodValidationPipe(SECTION_SCHEMAS[s]).transform(body);
    return this.settings.update(businessId, s, data);
  }
}
