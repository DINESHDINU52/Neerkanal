import { Module } from '@nestjs/common';
import { ComplaintsCtl } from './complaints.controller';

@Module({
  controllers: [ComplaintsCtl],
})
export class ComplaintsModule {}
