import { Module } from '@nestjs/common';
import { ExitCtl } from './exit.controller';

@Module({
  controllers: [ExitCtl],
})
export class ExitModule {}
