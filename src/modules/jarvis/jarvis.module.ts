import { Module } from '@nestjs/common';
import { Jarvis } from './jarvis.service';
import { JarvisCtl } from './jarvis.controller';

@Module({
  providers: [Jarvis],
  controllers: [JarvisCtl],
  exports: [Jarvis],
})
export class JarvisModule {}
