import { Entity, Index } from 'typeorm';
import { Base, S, J, N } from './base.entity';

@Entity()
export class Meeting extends Base {
  @Index()
  @S()
  companyId: string;

  @S() kind: string;
  @S() title: string;
  @S() hostId: string;
  @S() roomId: string;
  @S() link: string;
  @S() startsAt: string;
  @N(30) durationMin: number;
  @S({ default: 'SCHEDULED' }) status: string;
  @J() attendeeIds: string[];
  @J() ctx: any;
}
