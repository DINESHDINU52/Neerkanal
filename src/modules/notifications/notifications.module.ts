import { Module } from '@nestjs/common';
import { NotificationsCtl } from './notifications.controller';

@Module({
  controllers: [NotificationsCtl],
})
export class NotificationsModule {}
