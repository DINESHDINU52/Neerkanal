import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
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
} from './entities';

@Injectable()
export class Db {
  constructor(
    @InjectRepository(Company) public companies: Repository<Company>,
    @InjectRepository(User) public users: Repository<User>,
    @InjectRepository(Job) public jobs: Repository<Job>,
    @InjectRepository(Application) public apps: Repository<Application>,
    @InjectRepository(Meeting) public meetings: Repository<Meeting>,
    @InjectRepository(Approval) public approvals: Repository<Approval>,
    @InjectRepository(Attendance) public att: Repository<Attendance>,
    @InjectRepository(LeaveType) public leaveTypes: Repository<LeaveType>,
    @InjectRepository(LeaveBal) public leaveBal: Repository<LeaveBal>,
    @InjectRepository(Notification) public notes: Repository<Notification>,
    @InjectRepository(Rec) public recs: Repository<Rec>,
  ) {}

  addRec(type: string, o: Partial<Rec>): Promise<Rec> {
    return this.recs.save(
      this.recs.create({ type, data: {}, ...o } as any),
    ) as unknown as Promise<Rec>;
  }

  listRec(type: string, where: any = {}): Promise<Rec[]> {
    return this.recs.find({
      where: { type, ...where },
      order: { createdAt: 'DESC' },
    });
  }

  async rec(type: string, id: string): Promise<Rec> {
    const r = await this.recs.findOneBy({ id, type });
    if (!r) throw new NotFoundException(`${type} not found`);
    return r;
  }

  async user(id: string): Promise<User> {
    const u = await this.users.findOneBy({ id });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async company(id: string): Promise<Company> {
    const c = await this.companies.findOneBy({ id });
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  async byRole(companyId: string, roles: string[]): Promise<User[]> {
    return this.users.find({
      where: { companyId, role: In(roles), active: true },
    });
  }

  async ids(companyId: string, roles: string[]): Promise<string[]> {
    return (await this.byRole(companyId, roles)).map((u) => u.id);
  }

  async employees(companyId: string): Promise<User[]> {
    return this.users.find({
      where: { companyId, kind: 'EMPLOYEE', active: true },
    });
  }

  async teamOf(rmId: string): Promise<User[]> {
    return this.users.find({ where: { rmId, active: true } });
  }
}

export const clean = (u: User) => {
  if (!u) return u;
  const { passwordHash, otp, otpExp, ...r } = u as any;
  return r;
};
