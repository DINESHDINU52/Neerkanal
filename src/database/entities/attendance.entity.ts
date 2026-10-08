import { Entity, Index } from 'typeorm';
import { Base, S, J, F } from './base.entity';

@Entity()
export class Attendance extends Base {
  @Index()
  @S()
  companyId: string;

  @Index()
  @S()
  userId: string;

  @S() date: string;
  @S() status: string;
  @S() mode: string;
  @S() inAt: string;
  @S() outAt: string;
  @S() mood: string;
  @F() lat: number;
  @F() lng: number;
  @J() flags: any;
}
