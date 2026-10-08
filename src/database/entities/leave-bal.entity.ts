import { Entity, Index } from 'typeorm';
import { Base, S, F } from './base.entity';

@Entity()
export class LeaveBal extends Base {
  @Index()
  @S()
  userId: string;

  @S() code: string;
  @S() year: string;
  @F() bal: number;
}
