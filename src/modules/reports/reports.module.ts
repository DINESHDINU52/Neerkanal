import { Module } from '@nestjs/common';
import { ReportsCtl } from './reports.controller';

@Module({
  controllers: [ReportsCtl],
})
export class ReportsModule {}
