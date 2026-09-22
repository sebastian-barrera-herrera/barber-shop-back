import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';
import type { AuthUser } from '../../common/auth-user';
import { BusinessId, CurrentUser, Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

class CheckoutDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan, { message: 'Elige el plan mensual o el anual' })
  plan!: SubscriptionPlan;
}

class VerifyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  @Matches(/^[\w-]+$/)
  transactionId!: string;
}

@ApiTags('Suscripción')
@ApiBearerAuth()
@Roles('OWNER')
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscription: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado del plan: días restantes, precios y pagos hechos' })
  get(@BusinessId() businessId: string) {
    return this.subscription.get(businessId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Enlace de pago del plan elegido' })
  async checkout(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckoutDto,
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { email: true },
    });
    return this.subscription.checkout(businessId, dto.plan, owner?.email ?? null);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Confirmar el pago al volver de la pasarela' })
  verify(@BusinessId() businessId: string, @Body() dto: VerifyDto) {
    return this.subscription.verify(businessId, dto.transactionId);
  }
}
