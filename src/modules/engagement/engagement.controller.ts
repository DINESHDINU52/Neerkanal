import {
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS, ADMINS, ACTIVITIES } from '../../common/constants';
import { now, ymd, ym, horoscope } from '../../common/utils';

/** Default monthly 5-min 1:1 with each employee's HRBP, back-to-back 5-minute slots from 11:00 on the 5th. */
export async function scheduleOneOnOnes(
  db: Db,
  ap: Approvals,
  companyId: string,
) {
  const emps = (await db.employees(companyId)).filter((e) => e.hrbpId),
    by: Record<string, User[]> = {};
  emps.forEach((e) => (by[e.hrbpId] = by[e.hrbpId] || []).push(e));
  let n = 0;
  const day = new Date();
  day.setDate(5);
  if (day < new Date()) {
    day.setMonth(day.getMonth() + (new Date().getDate() > 5 ? 1 : 0));
  }
  for (const [hrbp, list] of Object.entries(by)) {
    for (let i = 0; i < list.length; i++) {
      const at = new Date(day);
      at.setHours(11, i * 5, 0, 0);
      const exists = (
        await db.meetings.find({
          where: { companyId, kind: 'ONE_ON_ONE', hostId: hrbp },
        })
      ).some(
        (m) =>
          m.ctx?.employeeId === list[i].id && m.ctx?.month === ym(at),
      );
      if (!exists) {
        await ap.meets(
          companyId,
          hrbp,
          'ONE_ON_ONE',
          `Monthly 1:1 — ${list[i].name}`,
          at.toISOString(),
          5,
          [list[i].id],
          { employeeId: list[i].id, month: ym(at) },
        );
        n++;
      }
    }
  }
  return { scheduled: n };
}

@Ctl('engagement')
@Feat('engagement')
export class EngagementCtl {
  constructor(
    private db: Db,
    private n: Notifier,
    private ap: Approvals,
  ) {}

  @Post('recognition')
  @Roles('RM', 'DEPT_HEAD', 'HR', 'HRBP', 'HR_MANAGER')
  async recognise(
    @Me() u: User,
    @Body()
    b: {
      userId: string;
      award: string;
      month?: string;
      reason?: string;
      monetary?: boolean;
      amount?: number;
    },
  ) {
    const e = await this.db.user(b.userId),
      month = b.month || ym();
    const r = await this.db.addRec('RECOGNITION', {
      companyId: u.companyId,
      ownerId: e.id,
      key: month,
      status: b.monetary ? 'PENDING_APPROVAL' : 'GIVEN',
      data: { ...b, month, by: u.name },
    });
    await this.db.addRec('POST', {
      companyId: u.companyId,
      ownerId: u.id,
      status: 'PUBLISHED',
      data: {
        kind: 'AWARD',
        text: `🏆 ${b.award} — ${e.name} (${month}). ${b.reason || ''}`,
        awardee: e.id,
        likes: [],
      },
    });
    await this.n.send(e.id, {
      title: `You received "${b.award}"!`,
      body: b.reason,
      type: 'AWARD',
      sms: true,
    });
    await this.n.send(await this.db.ids(u.companyId, HRS), {
      title: `Recognition: ${e.name} — ${b.award}`,
      body: b.monetary
        ? `Monetary ₹${b.amount} — approval needed`
        : 'Non-monetary',
      type: 'AWARD',
    });
    if (b.monetary) {
      const a = await this.ap.create(
        'REWARD',
        u,
        { recognitionId: r.id, awardee: e.id, amount: b.amount },
        ['HR', 'FINANCE'],
        `Reward ₹${b.amount} for ${e.name}`,
      );
      r.refId = a.id;
      await this.db.recs.save(r);
    }
    return r;
  }

  @Get('awards')
  awards(@Me() u: User, @Query('month') m?: string) {
    return this.db.listRec('RECOGNITION', {
      companyId: u.companyId,
      ...(m ? { key: m } : {}),
    });
  }

  @Post('water')
  async water(@Me() u: User, @Body() b: { status: 'DRANK' | 'LATER' }) {
    if (b.status === 'LATER') {
      await this.db.addRec('SNOOZE', {
        ownerId: u.id,
        status: 'OPEN',
        data: { dueAt: new Date(Date.now() + 20 * 6e4).toISOString() },
      });
      return { snoozedMinutes: 20 };
    }
    await this.db.addRec('WATER', {
      companyId: u.companyId,
      ownerId: u.id,
      key: ymd(),
      data: {},
    });
    return {
      today: (
        await this.db.listRec('WATER', { ownerId: u.id, key: ymd() })
      ).length,
    };
  }

  /** App reports phone idle minutes; ≥60 returns a small game/activity. */
  @Post('idle')
  async idle(@Me() u: User, @Body() b: { minutes: number }) {
    if (b.minutes < 60) return { activity: null };
    const a = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
    await this.db.addRec('ACTIVITY', {
      ownerId: u.id,
      key: ymd(),
      data: a,
    });
    return { activity: a };
  }

  @Post('one-on-ones/schedule')
  @Roles('HRBP', 'HR_MANAGER', 'HR')
  async sched(@Me() u: User) {
    return scheduleOneOnOnes(this.db, this.ap, u.companyId);
  }

  @Get('one-on-ones')
  async oneOnes(@Me() u: User) {
    return (
      await this.db.meetings.find({
        where: { companyId: u.companyId, kind: 'ONE_ON_ONE' },
        order: { startsAt: 'DESC' },
      })
    ).filter((m) => m.attendeeIds.includes(u.id));
  }

  @Post('one-on-ones/:id/feedback')
  @Roles('HRBP', 'HR_MANAGER', 'HR')
  async oneFb(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { mood?: string; notes: string; actionItems?: string[] },
  ) {
    const m = await this.db.meetings.findOneByOrFail({
      id,
      kind: 'ONE_ON_ONE',
    });
    m.status = 'DONE';
    await this.db.meetings.save(m);
    return this.db.addRec('ONE_ON_ONE_FB', {
      companyId: u.companyId,
      ownerId: u.id,
      refId: id,
      data: { ...b, employeeId: m.ctx?.employeeId },
    });
  }

  @Get('one-on-ones/feedback')
  @Roles('HRBP', 'HR_MANAGER', 'HR')
  ofb(@Me() u: User) {
    return this.db.listRec(
      'ONE_ON_ONE_FB',
      HRS.includes(u.role) && u.role !== 'HRBP'
        ? { companyId: u.companyId }
        : { ownerId: u.id },
    );
  }
}

@Ctl('feed')
export class FeedCtl {
  constructor(private db: Db) {}

  @Get()
  async feed(@Me() u: User) {
    const items: any[] = [];
    if (u.zodiac) {
      items.push({
        kind: 'HOROSCOPE',
        pinned: true,
        at: now(),
        ...horoscope(u.zodiac),
      });
    }
    if (u.companyId) {
      const posts = (
        await this.db.listRec('POST', { companyId: u.companyId })
      ).slice(0, 50);
      items.push(
        ...posts.map((p) => ({
          id: p.id,
          kind: p.data.kind || 'POST',
          at: p.createdAt,
          text: p.data.text,
          likes: (p.data.likes || []).length,
          by: p.ownerId,
        })),
      );
      const today = ymd().slice(5);
      for (const e of await this.db.employees(u.companyId)) {
        if (e.dob?.slice(5) === today) {
          items.push({
            kind: 'BIRTHDAY',
            at: now(),
            text: `🎂 Happy Birthday ${e.name}!`,
          });
        }
        if (
          e.doj &&
          e.doj.slice(5) === today &&
          e.doj.slice(0, 4) !== ymd().slice(0, 4)
        ) {
          items.push({
            kind: 'ANNIVERSARY',
            at: now(),
            text: `🎉 ${e.name} completes ${
              +ymd().slice(0, 4) - +e.doj.slice(0, 4)
            } year(s) today!`,
          });
        }
      }
    }
    return items.sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.at < b.at ? 1 : -1),
    );
  }

  @Get('horoscope')
  hs(@Me() u: User) {
    if (!u.zodiac) throw new BadRequestException('No zodiac on profile');
    return horoscope(u.zodiac);
  }

  @Post('posts')
  async post(@Me() u: User, @Body() b: { text: string; kind?: string }) {
    if (!u.companyId) throw new ForbiddenException();
    const kind =
      b.kind === 'ANNOUNCEMENT' && [...HRS, ...ADMINS].includes(u.role)
        ? 'ANNOUNCEMENT'
        : 'POST';
    return this.db.addRec('POST', {
      companyId: u.companyId,
      ownerId: u.id,
      status: 'PUBLISHED',
      data: { kind, text: b.text, likes: [] },
    });
  }

  @Post('posts/:id/like')
  async like(@Me() u: User, @Param('id') id: string) {
    const p = await this.db.rec('POST', id);
    const l = new Set<string>(p.data.likes || []);
    l.has(u.id) ? l.delete(u.id) : l.add(u.id);
    p.data = { ...p.data, likes: [...l] };
    await this.db.recs.save(p);
    return { likes: l.size };
  }
}
