import { Module } from '@nestjs/common';
import { EngagementCtl, FeedCtl } from './engagement.controller';

@Module({
  controllers: [EngagementCtl, FeedCtl],
})
export class EngagementModule {}
