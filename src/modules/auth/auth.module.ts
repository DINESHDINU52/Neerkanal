import { Module } from '@nestjs/common';
import { AuthCtl } from './auth.controller';

@Module({
  controllers: [AuthCtl],
})
export class AuthModule {}
