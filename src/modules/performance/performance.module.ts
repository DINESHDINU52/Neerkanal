import { Module } from '@nestjs/common';
import { PerformanceCtl } from './performance.controller';

@Module({
  controllers: [PerformanceCtl],
})
export class PerformanceModule {}
