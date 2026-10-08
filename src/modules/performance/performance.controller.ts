import {
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS } from '../../common/constants';
import { ym, ymd, now, prevMonth } from '../../common/utils';

export const score = (items: any[]) =>
  Math.round(
    items.reduce(
      (s, i) =>
        s +
        Math.min(150, ((i.achieved ?? 0) / (i.target || 1)) * 100),
      0,
    ) / items.length,
  );

@Ctl('performance')
@Feat('performance')
export class PerformanceCtl {
  constructor(
    private db: Db,
    private n: Notifier,
    private ap: Approvals,
  ) {}

  @Post('kpi')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER')
  async setKpi(
    @Me() u: User,
    @Body()
    b: {
      userId: string;
      month?: string;
      items?: { name: string; target: number; unit?: string }[];
      sameAsPrevious?: boolean;
    },
  ) {
    const e = await this.db.user(b.userId),
      month = b.month || ym();
    if (e.rmId !== u.id && !HRS.includes(u.role)) {
      throw new ForbiddenException('Not your team member');
    }
    if ((await this.db.listRec('KPI', { ownerId: e.id, key: month }))[0]) {
      throw new ConflictException('KPI already set for this month');
    }
    let items = b.items;
    if (b.sameAsPrevious) {
      const prev = (await this.db.listRec('KPI', { ownerId: e.id }))
        .filter((k) => k.key < month)
        .sort((a, c) => (a.key < c.key ? 1 : -1))[0];
      if (!prev) throw new BadRequestException('No previous month KPI');
      items = prev.data.items.map((i: any) => ({
        name: i.name,
        target: i.target,
        unit: i.unit,
      }));
    }
    if (!items?.length) throw new BadRequestException('items required');
    const k = await this.db.addRec('KPI', {
      companyId: e.companyId,
      ownerId: e.id,
      key: month,
      status: 'SET',
      data: { items, setBy: u.id, sameAsPrevious: !!b.sameAsPrevious },
    });
    await this.n.send(e.id, {
      title: `KPIs set for ${month}`,
      type: 'KPI',
      link: `/performance/kpi/${k.id}`,
    });
    return k;
  }

  @Get('kpi/mine')
  mine(@Me() u: User) {
    return this.db.listRec('KPI', { ownerId: u.id });
  }

  @Get('kpi/team')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER')
  async team(@Me() u: User, @Query('month') m = ym()) {
    const ids = HRS.includes(u.role)
      ? null
      : (await this.db.teamOf(u.id)).map((x) => x.id);
    return (
      await this.db.listRec('KPI', { companyId: u.companyId, key: m })
    ).filter((k) => !ids || ids.includes(k.ownerId));
  }

  @Post('kpi/:id/achieve')
  async achieve(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { items: { name: string; achieved: number }[] },
  ) {
    const k = await this.db.rec('KPI', id);
    if (k.ownerId !== u.id) throw new ForbiddenException();
    k.data.items = k.data.items.map((i: any) => ({
      ...i,
      achieved:
        b.items.find((x) => x.name === i.name)?.achieved ?? i.achieved,
    }));
    k.status = 'SUBMITTED';
    k.data = { ...k.data, scorePct: score(k.data.items) };
    await this.db.recs.save(k);
    await this.n.send(u.rmId, {
      title: `${u.name} submitted ${k.key} achievements`,
      type: 'KPI',
      link: `/performance/kpi/${id}`,
    });
    return k;
  }

  @Post('kpi/:id/verify')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER')
  async verify(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { approve: boolean; remarks?: string },
  ) {
    const k = await this.db.rec('KPI', id),
      e = await this.db.user(k.ownerId);
    if (e.rmId !== u.id && !HRS.includes(u.role)) {
      throw new ForbiddenException();
    }
    k.status = b.approve ? 'APPROVED' : 'REJECTED';
    k.data = { ...k.data, remarks: b.remarks, verifiedBy: u.id };
    await this.db.recs.save(k);
    if (b.approve) {
      // 3 consecutive months below 50% → alert HR to trigger PIP
      const last3 = await Promise.all(
        [0, 1, 2].map((i) =>
          this.db
            .listRec('KPI', {
              ownerId: e.id,
              key: prevMonth(k.key, i),
              status: 'APPROVED',
            })
            .then((r) => r[0]),
        ),
      );
      if (last3.every((x) => x && x.data.scorePct < 50)) {
        await this.n.send(await this.db.ids(e.companyId, HRS), {
          title: `PIP alert: ${e.name} below 50% for 3 consecutive months`,
          body: `Scores: ${last3
            .map((x) => x.data.scorePct + '%')
            .join(', ')}`,
          type: 'PIP',
          dedupe: `pipalert:${e.id}:${k.key}`,
          link: `/performance/pip/new?userId=${e.id}`,
          sms: true,
        });
      }
    }
    await this.n.send(e.id, {
      title: `KPI ${k.key} ${k.status}`,
      body: b.remarks,
      type: 'KPI',
    });
    return k;
  }

  @Post('pip')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async pip(
    @Me() u: User,
    @Body()
    b: {
      userId: string;
      endDate: string;
      terms: string;
      meetingAt?: string;
      mode?: 'ONLINE' | 'CALENDAR';
    },
  ) {
    const e = await this.db.user(b.userId),
      start = ymd();
    const p = await this.db.addRec('PIP', {
      companyId: e.companyId,
      ownerId: e.id,
      status: 'PENDING_ACK',
      data: {
        startDate: start,
        endDate: b.endDate,
        terms: b.terms,
        hrId: u.id,
        rmId: e.rmId,
      },
    });
    if (b.meetingAt) {
      const m = await this.ap.meets(
        e.companyId,
        u.id,
        'PIP',
        `PIP kick-off — ${e.name}`,
        b.meetingAt,
        30,
        [e.id, e.rmId].filter(Boolean),
        { pipId: p.id, mode: b.mode || 'ONLINE' },
      );
      p.data = { ...p.data, meetingId: m.id };
      await this.db.recs.save(p);
    }
    await this.n.send([e.id, e.rmId].filter(Boolean), {
      title: `PIP initiated for ${e.name}`,
      body: `Ends ${b.endDate}. Employee must acknowledge with e-signature.`,
      type: 'PIP',
      link: `/performance/pip/${p.id}`,
      sms: true,
    });
    return p;
  }

  @Get('pip')
  async pips(@Me() u: User) {
    return this.db.listRec(
      'PIP',
      HRS.includes(u.role)
        ? { companyId: u.companyId }
        : u.role === 'RM'
        ? { companyId: u.companyId }
        : { ownerId: u.id },
    );
  }

  @Post('pip/:id/ack')
  async ack(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { signature: string },
  ) {
    const p = await this.db.rec('PIP', id);
    if (p.ownerId !== u.id) throw new ForbiddenException();
    if (!b.signature) throw new BadRequestException('e-signature required');
    p.status = 'ACTIVE';
    p.data = { ...p.data, signature: b.signature, ackAt: now() };
    return this.db.recs.save(p);
  }

  @Post('pip/:id/outcome')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async outcome(
    @Me() u: User,
    @Param('id') id: string,
    @Body()
    b: {
      result: 'SUCCESS' | 'EXTEND' | 'SEPARATE';
      newEnd?: string;
      remarks?: string;
    },
  ) {
    const p = await this.db.rec('PIP', id),
      e = await this.db.user(p.ownerId);
    if (b.result === 'SUCCESS') p.status = 'COMPLETED_SUCCESS';
    else if (b.result === 'EXTEND') {
      p.data = { ...p.data, endDate: b.newEnd, extended: true };
      p.status = 'ACTIVE';
    } else {
      p.status = 'COMPLETED_FAILED';
      await this.ap.create(
        'TERMINATION',
        e,
        { reason: 'PIP not cleared' },
        ['HR_MANAGER'],
        `Separation (PIP failed): ${e.name}`,
      );
    }
    p.data = { ...p.data, outcome: b.result, remarks: b.remarks };
    await this.db.recs.save(p);
    await this.n.send([e.id, e.rmId].filter(Boolean), {
      title: `PIP outcome: ${b.result}`,
      type: 'PIP',
    });
    return p;
  }
}
