import { Module } from '@nestjs/common';
import { CommonCtl } from './common.controller';

@Module({
  controllers: [CommonCtl],
})
export class CommonModule {}
