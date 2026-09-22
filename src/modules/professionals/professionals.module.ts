import { Module } from '@nestjs/common';
import {
  ProfessionalsController,
  PublicProfessionalsController,
  TimeOffController,
} from './professionals.controller';
import { ProfessionalsService } from './professionals.service';
import { TimeOffService } from './time-off.service';

@Module({
  controllers: [ProfessionalsController, TimeOffController, PublicProfessionalsController],
  providers: [ProfessionalsService, TimeOffService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
