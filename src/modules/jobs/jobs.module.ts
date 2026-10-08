import { Module } from '@nestjs/common';
import { JobsCtl } from './jobs.controller';

@Module({
  controllers: [JobsCtl],
})
export class JobsModule {}
