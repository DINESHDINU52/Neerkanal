import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';

import { getDatabaseConfig } from './config/database.config';
import { ENV } from './common/utils';
import { AccessGuard } from './common/guards/access.guard';

import { DatabaseModule } from './database/database.module';
import { CoreModule } from './modules/core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { CandidateModule } from './modules/candidate/candidate.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AtsModule } from './modules/ats/ats.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveModule } from './modules/leave/leave.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { TrainingModule } from './modules/training/training.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { ExitModule } from './modules/exit/exit.module';
import { HandbookModule } from './modules/handbook/handbook.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CommonModule } from './modules/common/common.module';
import { JarvisModule } from './modules/jarvis/jarvis.module';
import { MeetModule } from './modules/meet/meet.module';
import { CronModule } from './modules/cron/cron.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    JwtModule.register({
      global: true,
      secret: ENV('JWT_SECRET', 'nerkanal-dev-secret'),
      signOptions: { expiresIn: '7d' },
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CoreModule,
    AuthModule,
    CandidateModule,
    JobsModule,
    AtsModule,
    OnboardingModule,
    AttendanceModule,
    LeaveModule,
    PayrollModule,
    TrackingModule,
    PerformanceModule,
    EngagementModule,
    TrainingModule,
    ComplaintsModule,
    ExitModule,
    HandbookModule,
    ReportsModule,
    SettingsModule,
    ApprovalsModule,
    NotificationsModule,
    CommonModule,
    JarvisModule,
    MeetModule,
    CronModule,
    SeederModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessGuard,
    },
  ],
})
export class AppModule {}
