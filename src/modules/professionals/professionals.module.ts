import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  ProfessionalsController,
  PublicProfessionalsController,
  TimeOffController,
} from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { TimeOffService } from './time-off.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfessionalsController, TimeOffController, PublicProfessionalsController],
  providers: [ProfessionalsService, TimeOffService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
