import { Module } from '@nestjs/common';
import { TrainingCtl } from './training.controller';

@Module({
  controllers: [TrainingCtl],
})
export class TrainingModule {}
