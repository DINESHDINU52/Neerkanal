import { Company } from './company.entity';
import { User } from './user.entity';
import { Job } from './job.entity';
import { Application } from './application.entity';
import { Meeting } from './meeting.entity';
import { Approval } from './approval.entity';
import { Attendance } from './attendance.entity';
import { LeaveType } from './leave-type.entity';
import { LeaveBal } from './leave-bal.entity';
import { Notification } from './notification.entity';
import { Rec } from './rec.entity';

export * from './base.entity';
export * from './company.entity';
export * from './user.entity';
export * from './job.entity';
export * from './application.entity';
export * from './meeting.entity';
export * from './approval.entity';
export * from './attendance.entity';
export * from './leave-type.entity';
export * from './leave-bal.entity';
export * from './notification.entity';
export * from './rec.entity';

export const ENTITIES = [
  Company,
  User,
  Job,
  Application,
  Meeting,
  Approval,
  Attendance,
  LeaveType,
  LeaveBal,
  Notification,
  Rec,
];
