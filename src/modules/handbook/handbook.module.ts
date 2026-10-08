import { Module } from '@nestjs/common';
import { HandbookCtl } from './handbook.controller';

@Module({
  controllers: [HandbookCtl],
})
export class HandbookModule {}
