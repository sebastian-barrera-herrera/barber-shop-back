import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { PublicCatalogController, ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [CategoriesModule],
  controllers: [ServicesController, PublicCatalogController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
