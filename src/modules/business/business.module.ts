import { Global, Module } from '@nestjs/common';
import { BusinessController, PublicBusinessController } from './business.controller';
import { BusinessService } from './business.service';

@Global()
@Module({
  controllers: [BusinessController, PublicBusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
