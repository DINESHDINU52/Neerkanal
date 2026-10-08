import { Module } from '@nestjs/common';
import { PayrollCtl } from './payroll.controller';

@Module({
  controllers: [PayrollCtl],
})
export class PayrollModule {}
