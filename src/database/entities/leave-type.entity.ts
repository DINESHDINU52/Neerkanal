import { Entity, Index } from 'typeorm';
import { Base, S, J, F, B, N } from './base.entity';

@Entity()
export class LeaveType extends Base {
  @Index()
  @S()
  companyId: string;

  @S() code: string;
  @S() name: string;
  @F() quota: number;
  @B() carry: boolean;
  @B(true) paid: boolean;
  @J() applicableTo: string[];
  @N(0) proofAfterDays: number;
}
