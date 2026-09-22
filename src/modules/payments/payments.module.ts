import { Global, Module } from '@nestjs/common';
import { PaymentsController, PublicPaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDERS } from './providers/payment-provider';
import { WompiProvider } from './providers/wompi.provider';

@Global()
@Module({
  controllers: [PaymentsController, PublicPaymentsController],
  providers: [
    WompiProvider,
    // Registro de pasarelas: agregar aquí StripeProvider, PayUProvider…
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (wompi: WompiProvider) => [wompi],
      inject: [WompiProvider],
    },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
