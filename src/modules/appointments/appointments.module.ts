import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { CustomersModule } from '../customers/customers.module';
import { AppointmentsController, PublicAppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AvailabilityModule, CustomersModule],
  controllers: [AppointmentsController, PublicAppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
