import { Module } from '@nestjs/common';
import { LeaveCtl } from './leave.controller';

@Module({
  controllers: [LeaveCtl],
})
export class LeaveModule {}
