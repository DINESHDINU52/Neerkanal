import { Global, Module } from '@nestjs/common';
import { Notifier } from './services/notifier.service';
import { Approvals } from './services/approvals.service';
import { ExternalJobs } from './services/external-jobs.service';
import { VideoAI } from './services/video-ai.service';
import { AppGateway } from './gateways/app.gateway';

@Global()
@Module({
  providers: [Notifier, Approvals, ExternalJobs, VideoAI, AppGateway],
  exports: [Notifier, Approvals, ExternalJobs, VideoAI, AppGateway],
})
export class CoreModule {}
