import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { WompiProvider } from '../payments/providers/wompi.provider';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

/** El cobro de la plataforma a cada negocio (no los pagos de los clientes al negocio). */
@Module({
  imports: [PaymentsModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, WompiProvider],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
