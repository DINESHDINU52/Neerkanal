import { Entity, Index } from 'typeorm';
import { Base, S, J } from './base.entity';

@Entity()
export class Job extends Base {
  @Index()
  @S()
  companyId: string;

  @S() title: string;
  @S() location: string;
  @S({ type: 'text' }) description: string;
  @S({ default: 'INTERNAL' }) source: string;
  @S() applyUrl: string;
  @S() reqId: string;
  @S() recruiterId: string;
  @S({ default: 'OPEN' }) status: string;
  @S() externalId: string;
  @S() companyName: string;
  @J() skills: string[];
}
