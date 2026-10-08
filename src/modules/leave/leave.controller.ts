import {
  Get,
  Post,
  Put,
  Body,
  Param,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { cfg } from '../../common/constants';
import { P, addDays } from '../../common/utils';

export async function creditYear(db: Db, companyId: string) {
  const year = String(new Date().getFullYear()),
    types = await db.leaveTypes.find({ where: { companyId } }),
    emps = await db.employees(companyId);
  let n = 0;
  for (const e of emps) {
    for (const t of types) {
      if (!t.quota) continue;
      const prev = await db.leaveBal.findOneBy({
        userId: e.id,
        code: t.code,
        year,
      });
      if (prev) continue;
      const last = await db.leaveBal.findOneBy({
        userId: e.id,
        code: t.code,
        year: String(+year - 1),
      });
      await db.leaveBal.save(
        db.leaveBal.create({
          userId: e.id,
          code: t.code,
          year,
          bal: t.quota + (t.carry && last ? Math.max(0, last.bal) : 0),
        }),
      );
      n++;
    }
  }
  return { credited: n };
}

@Ctl('leave')
@Feat('leave')
export class LeaveCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
  ) {}

  @Get('types')
  types(@Me() u: User) {
    return this.db.leaveTypes.find({ where: { companyId: u.companyId } });
  }

  @Post('types')
  @Roles('HRBP', 'HR_MANAGER', 'HR')
  async addType(@Me() u: User, @Body() b: any) {
    return this.db.leaveTypes.save(
      this.db.leaveTypes.create({
        companyId: u.companyId,
        code: b.code?.toUpperCase(),
        name: b.name,
        quota: b.quota || 0,
        carry: !!b.carry,
        paid: b.paid !== false,
        applicableTo: b.applicableTo || ['ALL'],
        proofAfterDays: b.proofAfterDays || 3,
      }),
    );
  }

  @Put('types/:id')
  @Roles('HRBP', 'HR_MANAGER', 'HR')
  async upType(@Me() u: User, @Param('id') id: string, @Body() b: any) {
    const t = await this.db.leaveTypes.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    Object.assign(t, b, { id, companyId: u.companyId });
    return this.db.leaveTypes.save(t);
  }

  @Get('balances')
  balances(@Me() u: User) {
    return this.db.leaveBal.find({
      where: { userId: u.id, year: String(new Date().getFullYear()) },
    });
  }

  @Post('credit-year')
  @Roles('HRBP', 'HR_MANAGER', 'HR')
  async credit(@Me() u: User) {
    return creditYear(this.db, u.companyId);
  }

  @Post('apply')
  async apply(
    @Me() u: User,
    @Body()
    b: {
      code: string;
      from: string;
      to?: string;
      reason: string;
      proofUrl?: string;
      halfDay?: boolean;
    },
  ) {
    const c = await this.db.company(u.companyId),
      s = cfg(c),
      t = await this.db.leaveTypes.findOneBy({
        companyId: u.companyId,
        code: (b.code || '').toUpperCase(),
      });
    if (!t) throw new BadRequestException('Unknown leave type');
    const to = b.to || b.from;
    if (to < b.from) throw new BadRequestException('"to" is before "from"');
    if (
      !t.applicableTo?.some((x) =>
        ['ALL', u.role, u.designation, u.department].includes(x),
      )
    ) {
      throw new ForbiddenException(`${t.name} is not applicable to you`);
    }
    let days = 0;
    for (let d = b.from; d <= to; d = addDays(d, 1)) {
      if (!s.weekOff.includes(P(d).getDay())) days += 1;
    }
    if (b.halfDay) days = 0.5;
    if (!days) throw new BadRequestException('Selected dates are all week-offs');
    if (days >= (t.proofAfterDays || 3) && !b.proofUrl) {
      throw new BadRequestException(
        `Valid proof is required for leave of ${
          t.proofAfterDays || 3
        } or more days`,
      );
    }
    if (t.paid) {
      const bal = await this.db.leaveBal.findOneBy({
        userId: u.id,
        code: t.code,
        year: String(P(b.from).getFullYear()),
      });
      if (!bal || bal.bal < days) {
        throw new BadRequestException(
          `Insufficient ${t.name} balance (${bal?.bal ?? 0})`,
        );
      }
    }
    return this.ap.create(
      'LEAVE',
      u,
      {
        code: t.code,
        from: b.from,
        to,
        days,
        reason: b.reason,
        proofUrl: b.proofUrl,
        paid: t.paid,
      },
      ['RM', 'HR', 'ADMIN'],
      `${t.name}: ${b.from}${to !== b.from ? ' → ' + to : ''} (${days}d) — ${
        u.name
      }`,
    );
  }

  @Post('compoff')
  async compoff(
    @Me() u: User,
    @Body() b: { workedOn: string; days?: number; reason: string },
  ) {
    return this.ap.create(
      'COMPOFF',
      u,
      { ...b, days: b.days || 1 },
      ['RM', 'HR'],
      `Comp-off credit: worked ${b.workedOn} — ${u.name}`,
    );
  }

  @Get('mine')
  async mine(@Me() u: User) {
    return Promise.all(
      (
        await this.db.approvals.find({
          where: { requesterId: u.id },
          order: { createdAt: 'DESC' },
        })
      )
        .filter((a) => ['LEAVE', 'COMPOFF', 'ATT_REQ'].includes(a.type))
        .map((a) => this.ap.view(a)),
    );
  }
}
