import { Module } from '@nestjs/common';
import { AtsCtl } from './ats.controller';

@Module({
  controllers: [AtsCtl],
})
export class AtsModule {}
