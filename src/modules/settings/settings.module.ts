import { Module } from '@nestjs/common';
import { SettingsCtl } from './settings.controller';

@Module({
  controllers: [SettingsCtl],
})
export class SettingsModule {}
