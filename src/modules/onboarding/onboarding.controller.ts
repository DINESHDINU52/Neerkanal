import {
  Get,
  Post,
  Put,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { Company, User } from '../../database/entities';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS, EMP_FIELDS, cfg } from '../../common/constants';
import { now, ymd, addDays, diffDays, rid } from '../../common/utils';

export const apptLetter = (c: Company, u: User, o: any) =>
  `<div style="font-family:Arial;max-width:720px;margin:auto"><h2 style="color:#0B1F4B">${c.name} — Appointment Letter</h2><p>Employee ID: <b>${u.empId}</b> · Date: ${ymd()}</p><p>Dear ${u.name},</p><p>We are pleased to appoint you as <b>${u.designation}</b> in the <b>${u.department || 'Company'}</b> department with effect from <b>${u.doj}</b>. You will be on probation until <b>${u.probationEnd}</b>. Your annual CTC is ₹${Number(o.ctc || 0).toLocaleString('en-IN')}.</p><p>Please log in to the employee portal with the credentials sent to you, complete your profile & documents, and acknowledge all company policies.</p><p>Sincerely,<br/>HR, ${c.name}</p></div>`;

export const empPct = (u: User, req: string[]) => {
  const p = u.profile || {},
    base = [u.name, u.phone, u.dob, u.email],
    f = EMP_FIELDS.map((k) => p[k]),
    got = (u.docs || []).map((d: any) => d.type);
  const total = base.length + f.length + req.length;
  const filled =
    [...base, ...f].filter(
      (v) => v !== undefined && v !== null && String(v).trim() !== '',
    ).length + req.filter((r) => got.includes(r)).length;
  return Math.round((filled / total) * 100);
};

@Ctl('onboarding')
@Feat('onboarding')
export class OnboardingCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
    private n: Notifier,
  ) {}

  @Get('pending')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async pending(@Me() u: User) {
    return this.db.listRec('OFFER', {
      companyId: u.companyId,
      status: 'PUSHED_TO_HRBP',
    });
  }

  /** On the joining day HR triggers "Joined": candidate ID → employee ID in the right series, appointment letter, new login. */
  @Post('join')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async join(
    @Me() hr: User,
    @Body()
    b: {
      offerId: string;
      doj?: string;
      rmId?: string;
      hrbpId?: string;
      department?: string;
      series?: string;
    },
  ) {
    const o = await this.db.rec('OFFER', b.offerId);
    if (o.status !== 'PUSHED_TO_HRBP') {
      throw new BadRequestException('Offer is not accepted/pushed');
    }
    const c = await this.db.company(hr.companyId),
      s = cfg(c),
      series = b.series || 'EMP',
      ser = s.series[series];
    if (!ser) throw new BadRequestException('Unknown ID series');
    const u = await this.db.user(o.ownerId);
    u.candidateId = u.id;
    u.empId = `${ser.prefix}${String(ser.next).padStart(4, '0')}`;
    ser.next += 1;
    c.settings = { ...s, series: { ...s.series, [series]: ser } };
    await this.db.companies.save(c);
    u.companyId = c.id;
    u.kind = 'EMPLOYEE';
    u.role = 'EMPLOYEE';
    u.designation = o.data.designation;
    u.department = b.department;
    u.doj = b.doj || o.data.doj;
    u.rmId = b.rmId;
    u.hrbpId = b.hrbpId || hr.id;
    u.probationEnd = addDays(u.doj, s.probationDays);
    u.probationState = 'ON';
    u.onboarding = 'PENDING';
    u.mustChangePwd = true;
    const temp = rid(10) + '#1';
    u.passwordHash = await bcrypt.hash(temp, 10);
    await this.db.users.save(u);
    const letter = await this.db.addRec('LETTER', {
      companyId: c.id,
      ownerId: u.id,
      status: 'SENT',
      data: { kind: 'APPOINTMENT', html: apptLetter(c, u, o.data) },
    });
    o.status = 'JOINED';
    await this.db.recs.save(o);
    const a = await this.db.apps.findOneBy({ id: o.refId });
    if (a) {
      a.status = 'HIRED';
      await this.db.apps.save(a);
    }
    const lv = await this.db.leaveTypes.find({ where: { companyId: c.id } });
    const year = String(new Date().getFullYear());
    for (const t of lv) {
      if (t.quota) {
        await this.db.leaveBal.save(
          this.db.leaveBal.create({ userId: u.id, code: t.code, year, bal: t.quota }),
        );
      }
    }
    await this.n.send(u.id, {
      title: `Welcome to ${c.name}! Your Employee ID is ${u.empId}`,
      body: `Login with ${u.empId} (or your email) and temporary password: ${temp}. Appointment letter attached in portal.`,
      type: 'ONBOARD',
      link: '/onboarding/me',
      sms: true,
    });
    return {
      empId: u.empId,
      tempPassword: temp,
      appointmentLetter: letter.data.html,
      probationEnd: u.probationEnd,
    };
  }

  @Get('me')
  async me(@Me() u: User) {
    const c = await this.db.company(u.companyId),
      req = cfg(c).requiredDocs;
    const pols = await this.db.listRec('POLICY', {
        companyId: u.companyId,
        status: 'PUBLISHED',
      }),
      acks = await this.db.listRec('ACK', { ownerId: u.id });
    const pending = pols
      .filter((p) => !acks.some((a) => a.refId === p.id))
      .map((p) => ({ id: p.id, title: p.data.title }));
    return {
      empId: u.empId,
      onboarding: u.onboarding,
      profilePct: empPct(u, req),
      requiredDocs: req,
      uploaded: (u.docs || []).map((d: any) => d.type),
      pendingPolicies: pending,
      letters: await this.db.listRec('LETTER', { ownerId: u.id }),
    };
  }

  @Put('profile')
  async profile(@Me() u: User, @Body() b: any) {
    const c = await this.db.company(u.companyId);
    u.profile = {
      ...(u.profile || {}),
      ...Object.fromEntries(
        Object.entries(b).filter(([k]) => EMP_FIELDS.includes(k)),
      ),
    };
    if (b.phone) u.phone = b.phone;
    u.profilePct = empPct(u, cfg(c).requiredDocs);
    await this.db.users.save(u);
    return { profilePct: u.profilePct };
  }

  @Post('documents')
  async doc(@Me() u: User, @Body() b: { type: string; url: string }) {
    const c = await this.db.company(u.companyId);
    u.docs = [
      ...(u.docs || []).filter((d: any) => d.type !== b.type),
      { type: b.type, url: b.url, at: now() },
    ];
    u.profilePct = empPct(u, cfg(c).requiredDocs);
    await this.db.users.save(u);
    return { profilePct: u.profilePct };
  }

  @Post('complete')
  async complete(@Me() u: User) {
    const m: any = await this.me(u);
    if (m.profilePct < 100) {
      throw new BadRequestException(`Profile is ${m.profilePct}% — complete 100%`);
    }
    if (m.pendingPolicies.length) {
      throw new BadRequestException(
        'Acknowledge all policies with digital signature first',
      );
    }
    u.onboarding = 'DONE';
    await this.db.users.save(u);
    await this.n.send(await this.db.ids(u.companyId, HRS), {
      title: `Onboarding completed: ${u.name} (${u.empId})`,
      type: 'ONBOARD',
    });
    return { onboarding: 'DONE' };
  }

  /* Probation — HR defines period in Settings; 2-day advance alert via cron; HR confirms / extends / separates */
  @Get('probation')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async prob(@Me() u: User) {
    return (await this.db.employees(u.companyId))
      .filter((e) => e.probationState === 'ON')
      .map((e) => ({
        id: e.id,
        name: e.name,
        empId: e.empId,
        probationEnd: e.probationEnd,
        daysLeft: diffDays(ymd(), e.probationEnd),
      }));
  }

  @Post('probation/:userId')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async decide(
    @Me() hr: User,
    @Param('userId') id: string,
    @Body()
    b: { action: 'CONFIRM' | 'EXTEND' | 'SEPARATE'; days?: number; reason?: string },
  ) {
    const e = await this.db.user(id);
    if (b.action === 'CONFIRM') {
      e.probationState = 'CONFIRMED';
    } else if (b.action === 'EXTEND') {
      e.probationEnd = addDays(e.probationEnd, b.days || 30);
    } else {
      e.probationState = 'SEPARATING';
      await this.ap.create(
        'TERMINATION',
        e,
        { reason: b.reason || 'Probation not cleared' },
        ['HR_MANAGER'],
        `Separation after probation: ${e.name}`,
      );
    }
    await this.db.users.save(e);
    await this.n.send(e.id, {
      title: `Probation update: ${b.action}`,
      type: 'ONBOARD',
      sms: true,
    });
    return {
      probationState: e.probationState,
      probationEnd: e.probationEnd,
    };
  }
}
