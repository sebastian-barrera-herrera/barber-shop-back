import { Module } from '@nestjs/common';
import { LocalStorage, STORAGE } from './storage';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [LocalStorage, { provide: STORAGE, useExisting: LocalStorage }],
  exports: [STORAGE, LocalStorage],
})
export class UploadsModule {}
