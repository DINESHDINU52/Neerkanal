import {
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Res,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Like, In } from 'typeorm';
import { Db } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { Company, User, Rec } from '../../database/entities';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { ADMINS, SAMPLE_STRUCT, cfg } from '../../common/constants';
import {
  round2,
  evalExpr,
  ym,
  diffDays,
  ymd,
  now,
  daysInMonth,
  csv,
} from '../../common/utils';

export const lawsFor = async (db: Db, c: Company) =>
  (await db.listRec('LAW')).filter(
    (l) =>
      (l.data.country || 'IN') === (c.country || 'IN') &&
      (!l.data.state || l.data.state === c.state),
  );

export function computePay(
  c: Company,
  u: User,
  structure: any[],
  ctc: number,
  paidDays: number,
  days: number,
  month: string,
  laws: Rec[],
) {
  const s = cfg(c),
    st = s.statutory,
    vars: Record<string, number> = {
      CTC: ctc,
      PAID_DAYS: paidDays,
      DAYS: days,
    };
  const earnings: any[] = [],
    deductions: any[] = [];
  for (const k of structure) {
    let amt =
      k.calc === 'FIXED'
        ? Number(k.value)
        : k.calc === 'PERCENT'
        ? ((vars[k.of] ??
            (() => {
              throw new BadRequestException(
                `"${k.code}" refers to unknown "${k.of}"`,
              );
            })()) *
            Number(k.value)) /
          100
        : evalExpr(k.formula, vars);
    vars[k.code] = amt;
    if (k.type === 'EARNING' && k.prorate !== false) {
      amt = (amt * paidDays) / days;
    }
    amt = round2(amt);
    (k.type === 'EARNING' ? earnings : deductions).push({
      code: k.code,
      name: k.name,
      amount: amt,
    });
  }
  const gross = round2(earnings.reduce((a, b) => a + b.amount, 0)),
    basic = earnings.find((e) => e.code === 'BASIC')?.amount || 0;
  const L = (kind: string) => laws.find((l) => l.data.kind === kind)?.data,
    pf = L('PF'),
    esi = L('ESI'),
    pt = L('PT'),
    lwf = L('LWF');
  const stat: any = {
    pfEE: 0,
    pfER: 0,
    epsER: 0,
    epfER: 0,
    esiEE: 0,
    esiER: 0,
    pt: 0,
    lwf: 0,
    lwfER: 0,
    epfWages: 0,
    epsWages: 0,
  };
  if (st.pf && pf && u.profile?.pfOptOut !== true) {
    stat.epfWages = Math.min(basic, st.pfCeiling ?? pf.wageCeiling);
    stat.epsWages = Math.min(basic, pf.wageCeiling);
    stat.pfEE = Math.round((stat.epfWages * pf.employeeRate) / 100);
    stat.epsER = Math.round((stat.epsWages * pf.epsRate) / 100);
    stat.pfER = Math.round((stat.epfWages * pf.employerRate) / 100);
    stat.epfER = stat.pfER - stat.epsER;
    deductions.push({
      code: 'PF',
      name: 'Provident Fund (EE)',
      amount: stat.pfEE,
      statutory: true,
    });
  }
  if (st.esi && esi && gross <= esi.wageCeiling && gross > 0) {
    stat.esiEE = Math.ceil((gross * esi.employeeRate) / 100);
    stat.esiER = Math.ceil((gross * esi.employerRate) / 100);
    deductions.push({
      code: 'ESI',
      name: 'ESI (EE)',
      amount: stat.esiEE,
      statutory: true,
    });
  }
  if (st.pt && pt && (!pt.months || pt.months.includes(+month.slice(5)))) {
    const g = gross * (pt.mult || 1),
      slab = pt.slabs.find((x: any) => g >= x.from && g <= x.to);
    stat.pt = slab?.amt || 0;
    if (stat.pt) {
      deductions.push({
        code: 'PT',
        name: 'Professional Tax',
        amount: stat.pt,
        statutory: true,
      });
    }
  }
  if (st.lwf && lwf && (!lwf.months || lwf.months.includes(+month.slice(5)))) {
    stat.lwf = lwf.employee || 0;
    stat.lwfER = lwf.employer || 0;
    if (stat.lwf) {
      deductions.push({
        code: 'LWF',
        name: 'Labour Welfare Fund',
        amount: stat.lwf,
        statutory: true,
      });
    }
  }
  const ded = round2(deductions.reduce((a, b) => a + b.amount, 0));
  return {
    earnings,
    deductions,
    gross,
    totalDeductions: ded,
    net: round2(gross - ded),
    statutory: stat,
    basic,
    ctc,
  };
}

@Ctl('payroll')
@Feat('payroll')
export class PayrollCtl {
  constructor(
    private db: Db,
    private n: Notifier,
  ) {}

  private async needSigner(u: User) {
    if (![...ADMINS, 'HR', 'HR_MANAGER'].includes(u.role)) {
      throw new ForbiddenException('Only HR / Admin / Super Admin can attest');
    }
  }

  /** Rules applicable to the company's state / country — shown to the user when they configure payroll. */
  @Get('compliance')
  async compliance(@Me() u: User) {
    const c = await this.db.company(u.companyId);
    return {
      state: c.state,
      country: c.country,
      notice:
        'Review these statutory rules before configuring salary structures. Seeded values marked sample:true must be verified.',
      rules: (await lawsFor(this.db, c)).map((l) => ({ id: l.id, ...l.data })),
    };
  }

  @Put('laws')
  @Roles('ADMIN')
  async law(@Me() u: User, @Body() b: { id?: string; data: any }) {
    if (b.id) {
      const r = await this.db.rec('LAW', b.id);
      r.data = b.data;
      return this.db.recs.save(r);
    }
    return this.db.addRec('LAW', { data: b.data });
  }

  @Get('structures')
  structures(@Me() u: User) {
    return this.db.listRec('STRUCT', { companyId: u.companyId });
  }

  @Post('structures')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'ADMIN')
  async addStruct(
    @Me() u: User,
    @Body() b: { name: string; components: any[] },
  ) {
    const c = await this.db.company(u.companyId);
    if (!b.components?.length) b.components = SAMPLE_STRUCT;
    computePay(c, u, b.components, 100000, 30, 30, ym(), []); // validates every formula/reference
    const s = await this.db.addRec('STRUCT', {
      companyId: u.companyId,
      status: 'ACTIVE',
      data: { name: b.name, components: b.components },
    });
    return {
      structure: s,
      notified: (await lawsFor(this.db, c)).map((l) => l.data),
    };
  }

  @Put('structures/:id')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'ADMIN')
  async upStruct(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { name?: string; components: any[] },
  ) {
    const r = await this.db.rec('STRUCT', id);
    computePay(
      await this.db.company(u.companyId),
      u,
      b.components,
      100000,
      30,
      30,
      ym(),
      [],
    );
    r.data = { ...r.data, ...b };
    return this.db.recs.save(r);
  }

  /** Assign structure + monthly CTC. If result breaches minimum wage, an HR/Admin digital attestation is required. */
  @Post('assign')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'ADMIN')
  async assign(
    @Me() u: User,
    @Body()
    b: {
      userId: string;
      structureId: string;
      ctc: number;
      attestation?: { signature: string; accepted: boolean };
    },
  ) {
    const c = await this.db.company(u.companyId),
      st = await this.db.rec('STRUCT', b.structureId),
      laws = await lawsFor(this.db, c);
    const calc = computePay(
        c,
        await this.db.user(b.userId),
        st.data.components,
        b.ctc,
        30,
        30,
        ym(),
        laws,
      ),
      viol: string[] = [];
    const mw = laws.find((l) => l.data.kind === 'MIN_WAGE')?.data;
    if (mw && calc.gross < mw.monthly) {
      viol.push(
        `Gross ₹${calc.gross} is below the minimum wage ₹${mw.monthly} for ${
          c.state
        }${mw.sample ? ' (sample value)' : ''}`,
      );
    }
    if (viol.length) {
      if (!b.attestation?.accepted || !b.attestation.signature) {
        throw new ConflictException({
          requiresAttestation: true,
          violations: viol,
          message:
            'Rule violation. Re-submit with attestation {signature, accepted:true} signed by HR / Admin / Super Admin.',
        });
      }
      await this.needSigner(u);
      await this.db.addRec('ATTEST', {
        companyId: u.companyId,
        ownerId: u.id,
        refId: b.userId,
        data: {
          violations: viol,
          signature: b.attestation.signature,
          signedAs: u.role,
          statement:
            'I acknowledge the applicable rule and knowingly configure this salary despite the violation.',
          at: now(),
          ctc: b.ctc,
        },
      });
    }
    const ex = (await this.db.listRec('EMPSAL', { ownerId: b.userId }))[0];
    if (ex) {
      ex.refId = b.structureId;
      ex.data = { ctc: b.ctc };
      return this.db.recs.save(ex);
    }
    return this.db.addRec('EMPSAL', {
      companyId: u.companyId,
      ownerId: b.userId,
      refId: b.structureId,
      data: { ctc: b.ctc },
    });
  }

  @Get('assignments')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'FINANCE', 'ADMIN')
  assignments(@Me() u: User) {
    return this.db.listRec('EMPSAL', { companyId: u.companyId });
  }

  @Get('attestations')
  @Roles('HR_MANAGER', 'ADMIN')
  att(@Me() u: User) {
    return this.db.listRec('ATTEST', { companyId: u.companyId });
  }

  /** Payroll-only clients upload attendance: rows [{empId, paidDays}] */
  @Post('attendance/upload')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'ADMIN')
  async upAtt(
    @Me() u: User,
    @Body() b: { month: string; rows: { empId: string; paidDays: number }[] },
  ) {
    const old = (
      await this.db.listRec('PAYATT', { companyId: u.companyId, key: b.month })
    )[0];
    if (old) {
      old.data = { rows: b.rows };
      return this.db.recs.save(old);
    }
    return this.db.addRec('PAYATT', {
      companyId: u.companyId,
      key: b.month,
      data: { rows: b.rows },
    });
  }

  @Post('runs')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'ADMIN')
  async run(@Me() u: User, @Body() b: { month: string }) {
    const month = b.month || ym(),
      c = await this.db.company(u.companyId),
      laws = await lawsFor(this.db, c),
      days = daysInMonth(month);
    if (
      (
        await this.db.listRec('PAYRUN', {
          companyId: u.companyId,
          key: month,
        })
      ).find((r) => r.status !== 'DRAFT')
    ) {
      throw new ConflictException(
        'Payroll for this month is already locked/paid',
      );
    }
    const upl = (
      await this.db.listRec('PAYATT', { companyId: u.companyId, key: month })
    )[0]?.data.rows as any[] | undefined;
    const lines: any[] = [];
    for (const es of await this.db.listRec('EMPSAL', {
      companyId: u.companyId,
    })) {
      const e = await this.db.users.findOneBy({ id: es.ownerId });
      if (!e || !e.active) continue;
      const st = await this.db.rec('STRUCT', es.refId);
      let paid = days;
      const up = upl?.find((r) => r.empId === e.empId);
      if (up) paid = Math.min(days, up.paidDays);
      else {
        const lop = await this.db.att.count({
          where: {
            userId: e.id,
            date: Like(month + '%'),
            status: In(['ABSENT', 'LOP']),
          },
        });
        paid = Math.max(0, days - lop);
      }
      const pay = computePay(
        c,
        e,
        st.data.components,
        es.data.ctc,
        paid,
        days,
        month,
        laws,
      );
      lines.push({
        userId: e.id,
        empId: e.empId,
        name: e.name,
        uan: e.profile?.uan,
        esiNo: e.profile?.esiNo,
        pan: e.profile?.pan,
        doj: e.doj,
        bank: { account: e.profile?.bankAccount, ifsc: e.profile?.ifsc },
        paidDays: paid,
        days,
        ...pay,
      });
    }
    const totals = {
      employees: lines.length,
      gross: round2(lines.reduce((a, l) => a + l.gross, 0)),
      net: round2(lines.reduce((a, l) => a + l.net, 0)),
      employerCost: round2(
        lines.reduce(
          (a, l) => a + l.gross + l.statutory.pfER + l.statutory.esiER,
          0,
        ),
      ),
    };
    const ex = (
      await this.db.listRec('PAYRUN', { companyId: u.companyId, key: month })
    )[0];
    if (ex) {
      ex.data = { lines, totals };
      return this.db.recs.save(ex);
    }
    return this.db.addRec('PAYRUN', {
      companyId: u.companyId,
      key: month,
      status: 'DRAFT',
      data: { lines, totals },
    });
  }

  @Get('runs')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'FINANCE', 'ADMIN')
  async runs(@Me() u: User) {
    return (
      await this.db.listRec('PAYRUN', { companyId: u.companyId })
    ).map((r) => ({
      id: r.id,
      month: r.key,
      status: r.status,
      totals: r.data.totals,
    }));
  }

  @Get('runs/:id')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'FINANCE', 'ADMIN')
  runOne(@Param('id') id: string) {
    return this.db.rec('PAYRUN', id);
  }

  @Post('runs/:id/lock')
  @Roles('HR_MANAGER', 'ADMIN')
  async lock(@Param('id') id: string) {
    const r = await this.db.rec('PAYRUN', id);
    r.status = 'LOCKED';
    await this.db.recs.save(r);
    await this.n.send(
      r.data.lines.map((l: any) => l.userId),
      {
        title: `Payslip for ${r.key} is available`,
        type: 'PAYROLL',
        link: `/payroll/payslip?month=${r.key}`,
      },
    );
    return r;
  }

  @Post('runs/:id/pay')
  @Roles('FINANCE', 'ADMIN')
  async pay(@Param('id') id: string) {
    const r = await this.db.rec('PAYRUN', id);
    if (r.status !== 'LOCKED') throw new BadRequestException('Lock the run first');
    r.status = 'PAID';
    return this.db.recs.save(r);
  }

  @Get('payslip')
  async payslip(@Me() u: User, @Query('month') month = ym()) {
    const r = (
      await this.db.listRec('PAYRUN', {
        companyId: u.companyId,
        key: month,
      })
    ).find((x) => x.status !== 'DRAFT');
    const l = r?.data.lines.find((x: any) => x.userId === u.id);
    if (!l) throw new NotFoundException('No payslip for this month');
    return {
      month,
      company: (await this.db.company(u.companyId)).name,
      ...l,
    };
  }

  /** Government-format downloads: pf (ECR text), esi, pt, lwf, bonus, gratuity, bank (NEFT) */
  @Get('runs/:id/report/:kind')
  @Roles('HR', 'HR_MANAGER', 'HRBP', 'FINANCE', 'ADMIN')
  async report(
    @Me() u: User,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Res() res: any,
  ) {
    const r = await this.db.rec('PAYRUN', id),
      L: any[] = r.data.lines,
      c = await this.db.company(u.companyId),
      laws = await lawsFor(this.db, c);
    let out = '',
      ext = 'csv';
    if (kind === 'pf') {
      ext = 'txt';
      out = L.filter((l) => l.statutory.pfEE)
        .map((l) =>
          [
            l.uan || '',
            l.name,
            Math.round(l.gross),
            l.statutory.epfWages,
            l.statutory.epsWages,
            l.statutory.epsWages,
            l.statutory.pfEE,
            l.statutory.epsER,
            l.statutory.epfER,
            l.days - l.paidDays,
            0,
          ].join('#~#'),
        )
        .join('\n');
    } else if (kind === 'esi') {
      out = csv([
        [
          'IP Number',
          'IP Name',
          'No of Days',
          'Total Monthly Wages',
          'Reason Code for Zero workings days',
          'Last Working Day',
        ],
        ...L.filter((l) => l.statutory.esiEE).map((l) => [
          l.esiNo || '',
          l.name,
          l.paidDays,
          l.gross,
          l.paidDays ? '' : '1',
          '',
        ]),
      ]);
    } else if (kind === 'pt') {
      out = csv([
        ['Emp ID', 'Name', 'Gross', 'Professional Tax', 'State'],
        ...L.filter((l) => l.statutory.pt).map((l) => [
          l.empId,
          l.name,
          l.gross,
          l.statutory.pt,
          c.state,
        ]),
      ]);
    } else if (kind === 'lwf') {
      out = csv([
        ['Emp ID', 'Name', 'Employee share', 'Employer share'],
        ...L.filter((l) => l.statutory.lwf).map((l) => [
          l.empId,
          l.name,
          l.statutory.lwf,
          l.statutory.lwfER,
        ]),
      ]);
    } else if (kind === 'bonus') {
      const b = laws.find((x) => x.data.kind === 'BONUS')?.data || {
        pct: 8.33,
        calcCeiling: 7000,
        wageCeiling: 21000,
      };
      out = csv([
        ['Emp ID', 'Name', 'Bonus wage', 'Monthly accrual', 'Annual (approx)'],
        ...L.filter((l) => l.gross <= b.wageCeiling).map((l) => {
          const w = Math.min(
            l.basic,
            Math.max(
              b.calcCeiling,
              laws.find((x) => x.data.kind === 'MIN_WAGE')?.data.monthly || 0,
            ),
          );
          return [
            l.empId,
            l.name,
            w,
            round2((w * b.pct) / 100),
            round2((w * b.pct * 12) / 100),
          ];
        }),
      ]);
    } else if (kind === 'gratuity') {
      const g = laws.find((x) => x.data.kind === 'GRATUITY')?.data || {
        days: 15,
        perDays: 26,
        minYears: 5,
      };
      out = csv([
        [
          'Emp ID',
          'Name',
          'DOJ',
          'Years',
          'Eligible',
          'Monthly provision',
          'Accrued liability',
        ],
        ...L.map((l) => {
          const y = round2(diffDays(l.doj || ymd(), ymd()) / 365.25),
            per = (l.basic * g.days) / g.perDays;
          return [
            l.empId,
            l.name,
            l.doj,
            y,
            y >= g.minYears ? 'YES' : 'NO',
            round2(per / 12),
            round2(per * Math.floor(y)),
          ];
        }),
      ]);
    } else if (kind === 'bank') {
      out = csv([
        ['Beneficiary Name', 'Account No', 'IFSC', 'Amount', 'Narration', 'Emp ID'],
        ...L.map((l) => [
          l.name,
          l.bank.account,
          l.bank.ifsc,
          l.net,
          `Salary ${r.key}`,
          l.empId,
        ]),
      ]);
    } else {
      throw new BadRequestException(
        'kind must be pf|esi|pt|lwf|bonus|gratuity|bank',
      );
    }
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${kind}_${r.key}.${ext}"`,
    );
    res.send(out);
  }
}
