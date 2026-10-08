import {
  Get,
  Post,
  Put,
  Body,
  Param,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Db, clean } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Me, Public } from '../../common/decorators/auth.decorators';
import { MODULE_KEYS, ROLES, ADMINS, cfg } from '../../common/constants';
import { rid, zodiac } from '../../common/utils';

@Ctl('settings')
export class SettingsCtl {
  constructor(
    private db: Db,
    private n: Notifier,
  ) {}

  @Get('plans')
  @Public()
  plans() {
    return {
      modules: MODULE_KEYS.concat('candidate-portal(free)'),
      ats: {
        FREE: { openJobPosts: 2, candidatePool: false },
        PREMIUM: { openJobPosts: 5, candidatePool: true },
      },
      note: 'Buyers pick any combination of modules, e.g. payroll only, ATS only.',
    };
  }

  @Get()
  async get(@Me() u: User) {
    const c = await this.db.company(u.companyId);
    return {
      company: {
        id: c.id,
        name: c.name,
        state: c.state,
        country: c.country,
        modules: c.modules,
        atsPlan: c.atsPlan,
        deviceKey: ADMINS.includes(u.role) ? c.deviceKey : undefined,
      },
      settings: cfg(c),
    };
  }

  @Put()
  @Roles('ADMIN', 'HR_MANAGER')
  async put(@Me() u: User, @Body() b: any) {
    const c = await this.db.company(u.companyId);
    if (b.name) c.name = b.name;
    if (b.state) c.state = b.state;
    if (b.country) c.country = b.country;
    c.settings = { ...cfg(c), ...(b.settings || {}) };
    await this.db.companies.save(c);
    return this.get(u);
  }

  /** Buy / drop modules and change ATS plan (wire your payment gateway to call this after a successful payment). */
  @Post('subscribe')
  @Roles('SUPER_ADMIN')
  async sub(
    @Me() u: User,
    @Body() b: { modules?: string[]; atsPlan?: 'FREE' | 'PREMIUM' },
  ) {
    const c = await this.db.company(u.companyId);
    if (b.modules) {
      c.modules = b.modules.filter((m) => MODULE_KEYS.includes(m));
    }
    if (b.atsPlan) c.atsPlan = b.atsPlan;
    await this.db.companies.save(c);
    return { modules: c.modules, atsPlan: c.atsPlan };
  }

  @Post('users')
  @Roles('ADMIN', 'HR_MANAGER', 'HR', 'HRBP')
  async addUser(
    @Me() u: User,
    @Body()
    b: {
      email: string;
      name: string;
      role: string;
      rmId?: string;
      hrbpId?: string;
      designation?: string;
      department?: string;
      password?: string;
      empId?: string;
      dob?: string;
      phone?: string;
    },
  ) {
    if (!ROLES.includes(b.role) || ['SUPER_ADMIN', 'CANDIDATE'].includes(b.role)) {
      throw new BadRequestException('Invalid role');
    }
    if (await this.db.users.findOneBy({ email: b.email.toLowerCase() })) {
      throw new ConflictException('Email exists');
    }
    const pw = b.password || rid(10) + '#1';
    const x = await this.db.users.save(
      this.db.users.create({
        ...b,
        email: b.email.toLowerCase(),
        passwordHash: await bcrypt.hash(pw, 10),
        companyId: u.companyId,
        kind: b.role === 'EMPLOYEE' ? 'EMPLOYEE' : 'STAFF',
        zodiac: zodiac(b.dob || ''),
        verified: true,
        mustChangePwd: true,
        onboarding: 'DONE',
        profile: {},
        docs: [],
      }),
    );
    await this.n.send(x.id, {
      title: 'Your Nerkanal account is ready',
      body: `Login: ${x.email} / ${pw}`,
      type: 'AUTH',
    });
    return { user: clean(x), tempPassword: pw };
  }

  @Get('users')
  @Roles('ADMIN', 'HR_MANAGER', 'HR', 'HRBP', 'RM')
  async users(@Me() u: User) {
    return (
      await this.db.users.find({
        where: { companyId: u.companyId },
        order: { name: 'ASC' },
      })
    ).map(clean);
  }

  @Put('users/:id')
  @Roles('ADMIN', 'HR_MANAGER', 'HR', 'HRBP')
  async upUser(@Me() u: User, @Param('id') id: string, @Body() b: any) {
    const x = await this.db.users.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    for (const k of [
      'role',
      'rmId',
      'hrbpId',
      'designation',
      'department',
      'active',
    ]) {
      if (b[k] !== undefined) (x as any)[k] = b[k];
    }
    return clean(await this.db.users.save(x));
  }
}
