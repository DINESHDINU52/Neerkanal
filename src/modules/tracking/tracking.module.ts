import { Module } from '@nestjs/common';
import { TrackingCtl, ClaimsCtl } from './tracking.controller';

@Module({
  controllers: [TrackingCtl, ClaimsCtl],
})
export class TrackingModule {}
