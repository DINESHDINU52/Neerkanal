import { Module } from '@nestjs/common';
import { ApprovalsCtl } from './approvals.controller';

@Module({
  controllers: [ApprovalsCtl],
})
export class ApprovalsModule {}
