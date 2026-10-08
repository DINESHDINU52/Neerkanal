import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Db } from '../../database/database.service';
import { User } from '../../database/entities/user.entity';
import { MODULE_KEYS, SEED_LAWS, SAMPLE_STRUCT } from '../../common/constants';
import { zodiac } from '../../common/utils';

const log = new Logger('Seeder');

@Injectable()
export class SeederService implements OnModuleInit {
  constructor(private db: Db) {}

  async onModuleInit() {
    if (!(await this.db.listRec('LAW')).length) {
      for (const l of SEED_LAWS) await this.db.addRec('LAW', { data: l });
    }
    if (await this.db.companies.count()) return;

    const c = await this.db.companies.save(
      this.db.companies.create({
        name: 'Nerkanal Demo Pvt Ltd',
        state: 'Tamil Nadu',
        country: 'IN',
        modules: MODULE_KEYS,
        atsPlan: 'PREMIUM',
        deviceKey: 'demo-device-key',
        settings: {
          geofences: [{ name: 'HQ', lat: 13.0827, lng: 80.2707, radiusM: 200 }],
        },
      }),
    );

    const mk = async (
      email: string,
      name: string,
      role: string,
      extra: any = {},
    ): Promise<User> => {
      const u = this.db.users.create({
        email,
        name,
        role,
        kind:
          role === 'EMPLOYEE' || role === 'RM' ? 'EMPLOYEE' : 'STAFF',
        companyId: c.id,
        passwordHash: await bcrypt.hash('Nerkanal@123', 10),
        verified: true,
        onboarding: 'DONE',
        profile: {},
        docs: [],
        dob: '1994-08-15',
        zodiac: zodiac('1994-08-15'),
        ...extra,
      });
      return (this.db.users.save as any)(u) as Promise<User>;
    };

    await mk('superadmin@nerkanal.app', 'Super Admin', 'SUPER_ADMIN');
    await mk('admin@nerkanal.app', 'Admin', 'ADMIN');
    const hrm = await mk('hrmanager@nerkanal.app', 'HR Manager', 'HR_MANAGER');
    const hrbp = await mk('hrbp@nerkanal.app', 'HRBP Priya', 'HRBP');
    const hr = await mk('hr@nerkanal.app', 'HR Executive', 'HR');
    await mk('recruiter@nerkanal.app', 'Recruiter Ravi', 'RECRUITER');
    await mk('finance@nerkanal.app', 'Finance Fatima', 'FINANCE');
    await mk('depthead@nerkanal.app', 'Dept Head Dev', 'DEPT_HEAD', {
      department: 'Engineering',
    });
    await mk('panel@nerkanal.app', 'Panel Pooja', 'PANEL');

    const rm = await mk('rm@nerkanal.app', 'Manager Mohan', 'RM', {
      empId: 'NK0001',
      designation: 'Engineering Manager',
      department: 'Engineering',
      doj: '2024-01-10',
      hrbpId: hrbp.id,
      probationState: 'CONFIRMED',
      rmId: hrm.id,
    });

    const emp = await mk('employee@nerkanal.app', 'Employee Esha', 'EMPLOYEE', {
      empId: 'NK0002',
      designation: 'Software Engineer',
      department: 'Engineering',
      doj: '2025-06-01',
      rmId: rm.id,
      hrbpId: hrbp.id,
      probationState: 'CONFIRMED',
      profile: {
        bankAccount: '1234567890',
        ifsc: 'HDFC0000001',
        uan: '100000000001',
      },
    });

    await this.db.users.save(
      this.db.users.create({
        email: 'candidate@nerkanal.app',
        name: 'Candidate Karthik',
        role: 'CANDIDATE',
        kind: 'CANDIDATE',
        passwordHash: await bcrypt.hash('Nerkanal@123', 10),
        verified: true,
        dob: '1998-03-02',
        phone: '9999999999',
        zodiac: zodiac('1998-03-02'),
        profile: {},
        docs: [],
        profilePct: 0,
      }),
    );

    const lt = [
      ['CL', 'Casual Leave', 12, false, true],
      ['SL', 'Sick Leave', 8, false, true],
      ['PL', 'Privilege Leave', 15, true, true],
      ['CO', 'Comp-off', 0, false, true],
      ['LOP', 'Loss of Pay', 0, false, false],
    ] as const;

    for (const [code, name, quota, carry, paid] of lt) {
      await this.db.leaveTypes.save(
        this.db.leaveTypes.create({
          companyId: c.id,
          code,
          name,
          quota,
          carry,
          paid,
          applicableTo: ['ALL'],
          proofAfterDays: 3,
        }),
      );
    }

    const year = String(new Date().getFullYear());
    for (const u of [rm, emp]) {
      for (const [code, , quota] of lt) {
        if (quota) {
          await this.db.leaveBal.save(
            this.db.leaveBal.create({ userId: u.id, code, year, bal: quota }),
          );
        }
      }
    }

    const st = await this.db.addRec('STRUCT', {
      companyId: c.id,
      status: 'ACTIVE',
      data: { name: 'Standard Structure', components: SAMPLE_STRUCT },
    });
    await this.db.addRec('EMPSAL', {
      companyId: c.id,
      ownerId: emp.id,
      refId: st.id,
      data: { ctc: 60000 },
    });
    await this.db.addRec('EMPSAL', {
      companyId: c.id,
      ownerId: rm.id,
      refId: st.id,
      data: { ctc: 120000 },
    });

    await this.db.addRec('POLICY', {
      companyId: c.id,
      ownerId: hr.id,
      status: 'PUBLISHED',
      data: {
        title: 'Code of Conduct',
        version: '1.0',
        body: 'All employees shall act with integrity, respect and professionalism…',
      },
    });
    await this.db.addRec('POLICY', {
      companyId: c.id,
      ownerId: hr.id,
      status: 'PUBLISHED',
      data: {
        title: 'POSH Policy',
        version: '1.0',
        body: 'Nerkanal has zero tolerance for sexual harassment at the workplace…',
      },
    });

    log.log(
      'Seeded demo company. Logins (password Nerkanal@123): superadmin@ / admin@ / hrmanager@ / hrbp@ / hr@ / recruiter@ / finance@ / depthead@ / panel@ / rm@ / employee@ / candidate@  → nerkanal.app',
    );
  }
}
