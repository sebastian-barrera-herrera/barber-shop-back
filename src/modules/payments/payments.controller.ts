import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TransactionStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { AuthUser } from '../../common/auth-user';
import { BusinessId, CurrentUser, Public, Roles } from '../../common/decorators';
import { PageQuery } from '../../common/pagination';
import { Trim } from '../../common/validation';
import { BusinessService } from '../business/business.service';
import { PaymentsService } from './payments.service';

class WompiConfigDto {
  @ApiProperty({ enum: ['SANDBOX', 'PRODUCTION'] })
  @IsIn(['SANDBOX', 'PRODUCTION'])
  environment!: 'SANDBOX' | 'PRODUCTION';

  @ApiProperty({ example: 'pub_test_xxx' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicKey?: string;

  @ApiPropertyOptional({ description: 'Vacío = conservar el guardado' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  privateKey?: string;

  @ApiPropertyOptional({ description: 'Vacío = conservar el guardado' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  integritySecret?: string;

  @ApiPropertyOptional({ description: 'Vacío = conservar el guardado' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  eventsSecret?: string;

  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;
}

class ListPaymentsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;
}

class VerifyDto {
  @ApiProperty({ description: 'id que la pasarela agrega al volver (?id=...)' })
  @IsString()
  @Matches(/^[\w-]{1,64}$/)
  transactionId!: string;
}

@ApiTags('Pagos')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Pagos en línea recibidos' })
  list(@CurrentUser() user: AuthUser, @Query() q: ListPaymentsQuery) {
    return this.payments.list(user, q);
  }

  @Post(':id/refunded')
  @HttpCode(204)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Registrar que se reembolsó (desde el panel de la pasarela)' })
  refunded(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.markRefunded(user, id);
  }

  @Get('settings/wompi')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Configuración de Wompi (sin secretos)' })
  getWompi(@BusinessId() businessId: string) {
    return this.payments.getConfig(businessId, 'wompi');
  }

  @Put('settings/wompi')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Conectar Wompi (los secretos se guardan cifrados)' })
  saveWompi(@BusinessId() businessId: string, @Body() dto: WompiConfigDto) {
    return this.payments.saveConfig(
      businessId,
      {
        environment: dto.environment,
        publicKey: dto.publicKey ?? '',
        isEnabled: dto.isEnabled,
        secrets: {
          privateKey: dto.privateKey,
          integritySecret: dto.integritySecret,
          eventsSecret: dto.eventsSecret,
        },
      },
      'wompi',
    );
  }

  /** La pasarela avisa aquí. Sin sesión: se valida con la firma del evento. */
  @Public()
  @SkipThrottle()
  @Post('webhooks/:provider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook de la pasarela (firmado)' })
  webhook(@Param('provider') provider: string, @Body() body: unknown) {
    return this.payments.handleWebhook(provider, body);
  }
}

@ApiTags('Público')
@Public()
@Controller('public/:slug/appointments/by-token/:token/payments')
export class PublicPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly business: BusinessService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Pagar la cita en línea (devuelve la URL de la pasarela)' })
  async start(@Param('slug') slug: string, @Param('token') token: string) {
    return this.payments.startCheckout(await this.business.resolveSlug(slug), token);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar el estado al volver de la pasarela' })
  async verify(@Param('slug') slug: string, @Param('token') token: string, @Body() dto: VerifyDto) {
    return this.payments.verifyReturn(
      await this.business.resolveSlug(slug),
      token,
      dto.transactionId,
    );
  }
}
