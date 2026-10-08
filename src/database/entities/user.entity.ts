import { Entity, Column, Index } from 'typeorm';
import { Base, S, J, N, B } from './base.entity';

@Entity()
export class User extends Base {
  @Index()
  @S()
  companyId: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @S() passwordHash: string;
  @S() name: string;
  @S({ default: 'CANDIDATE' }) role: string;
  @S({ default: 'CANDIDATE' }) kind: string;
  @S() phone: string;
  @S() dob: string;
  @S() zodiac: string;
  @S() otp: string;
  @S() otpExp: string;
  @S() empId: string;
  @S() rmId: string;
  @S() hrbpId: string;
  @S() designation: string;
  @S() department: string;
  @S() doj: string;
  @S() probationEnd: string;
  @S() probationState: string;
  @S({ default: 'NA' }) onboarding: string;
  @S() videoLockUntil: string;
  @S() candidateId: string;

  @B() verified: boolean;
  @B(true) active: boolean;
  @B() mustChangePwd: boolean;
  @N() profilePct: number;
  @N() videoAttempts: number;

  @J() profile: any;
  @J() docs: any[];
  @J() video: any;
}
