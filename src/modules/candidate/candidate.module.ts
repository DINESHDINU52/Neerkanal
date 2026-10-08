import { Module } from '@nestjs/common';
import { CandidateCtl } from './candidate.controller';

@Module({
  controllers: [CandidateCtl],
})
export class CandidateModule {}
