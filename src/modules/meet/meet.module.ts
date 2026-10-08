import { Module } from '@nestjs/common';
import { MeetCtl } from './meet.controller';

@Module({
  controllers: [MeetCtl],
})
export class MeetModule {}
