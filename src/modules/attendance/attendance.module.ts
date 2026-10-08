import { Module } from '@nestjs/common';
import { AttendanceCtl } from './attendance.controller';

@Module({
  controllers: [AttendanceCtl],
})
export class AttendanceModule {}
