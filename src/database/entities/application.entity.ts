import { Entity, Index } from 'typeorm';
import { Base, S, J } from './base.entity';

@Entity()
export class Application extends Base {
  @Index()
  @S()
  companyId: string;

  @S() jobId: string;
  @S() candidateId: string;
  @S({ default: 'APPLIED' }) status: string;
  @J() timeline: any[];
  @J() docs: any[];
  @S({ type: 'text' }) notes: string;
}
