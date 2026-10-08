import { Entity, Index } from 'typeorm';
import { Base, S, J, N } from './base.entity';

@Entity()
export class Approval extends Base {
  @Index()
  @S()
  companyId: string;

  @S() type: string;
  @S() requesterId: string;
  @S() title: string;
  @S({ default: 'PENDING' }) status: string;
  @N() step: number;
  @J() chain: string[];
  @J() payload: any;
  @J() history: any[];
}
