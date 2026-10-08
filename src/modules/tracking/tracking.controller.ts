import {
  Get,
  Post,
  Put,
  Body,
  Param,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS, ADMINS, cfg } from '../../common/constants';
import { now, round2, hav, mapUrl } from '../../common/utils';

export async function createClaim(
  db: Db,
  ap: Approvals,
  n: Notifier,
  u: User,
  o: {
    tripId?: string;
    distanceKm?: number;
    bills?: any[];
    title?: string;
  },
) {
  const c = await db.company(u.companyId),
    s = cfg(c),
    travel = round2((o.distanceKm || 0) * s.ratePerKm),
    reimb = round2(
      (o.bills || []).reduce((a, b) => a + Number(b.amount || 0), 0),
    ),
    total = round2(travel + reimb),
    over = total > s.claimLimit;
  const a = await ap.create(
    'CLAIM',
    u,
    {
      tripId: o.tripId,
      distanceKm: o.distanceKm || 0,
      ratePerKm: s.ratePerKm,
      travelAmount: travel,
      bills: o.bills || [],
      reimbursementAmount: reimb,
      total,
      limit: s.claimLimit,
      overLimit: over,
      paid: false,
    },
    ['RM', 'HR', 'FINANCE'],
    `${o.title || 'Travel claim'} ₹${total} — ${u.name}`,
  );
  if (over) {
    await n.send(
      [u.rmId, ...(await db.ids(u.companyId, HRS))].filter(Boolean),
      {
        title: `Claim above limit: ${u.name} ₹${total} (limit ₹${s.claimLimit})`,
        type: 'CLAIM',
        link: `/approvals/${a.id}`,
      },
    );
  }
  return a;
}

@Ctl('tracking')
@Feat('tracking')
export class TrackingCtl {
  constructor(
    private db: Db,
    private n: Notifier,
    private ap: Approvals,
  ) {}

  @Post('start')
  async start(@Me() u: User, @Body() b: { purpose?: string }) {
    if (
      (
        await this.db.listRec('TRIP', {
          ownerId: u.id,
          status: 'ACTIVE',
        })
      ).length
    ) {
      throw new ConflictException('Trip already active');
    }
    return this.db.addRec('TRIP', {
      companyId: u.companyId,
      ownerId: u.id,
      status: 'ACTIVE',
      data: {
        purpose: b?.purpose,
        startedAt: now(),
        distanceM: 0,
        lastPingAt: now(),
        lastMoveAt: now(),
        enabled: true,
        path: [],
        idle: [],
        offSince: null,
        rmNotified: false,
        hrNotified: false,
      },
    });
  }

  /** Mobile app sends a ping every ~30 s (also with enabled:false when the user switches location off). */
  @Post('ping')
  async ping(
    @Me() u: User,
    @Body() b: { lat?: number; lng?: number; enabled?: boolean },
  ) {
    const t = (
      await this.db.listRec('TRIP', { ownerId: u.id, status: 'ACTIVE' })
    )[0];
    if (!t) throw new BadRequestException('No active trip');
    const d = t.data,
      c = await this.db.company(u.companyId),
      s = cfg(c);
    d.lastPingAt = now();
    if (b.enabled === false) {
      d.enabled = false;
      if (!d.offSince) {
        d.offSince = now();
      }
      if (!d.rmNotified) {
        d.rmNotified = true;
        await this.n.send(u.rmId || (await this.db.ids(u.companyId, HRS)), {
          title: `${u.name} turned location OFF`,
          body: 'Live tracking is interrupted',
          type: 'TRACKING',
          sms: true,
          link: '/tracking/live',
        });
      }
    } else {
      d.enabled = true;
      d.offSince = null;
      d.rmNotified = false;
      d.hrNotified = false;
      if (d.lastLat !== undefined) {
        const m = hav(d.lastLat, d.lastLng, b.lat!, b.lng!);
        if (m >= 30) {
          d.distanceM += m;
          d.lastMoveAt = now();
          d.path.push([b.lat, b.lng, now()]);
          if (d.path.length > 1500) d.path.shift();
          if (d.idle.length && !d.idle[d.idle.length - 1].to) {
            d.idle[d.idle.length - 1].to = now();
          }
        } else if (
          (Date.now() - +new Date(d.lastMoveAt)) / 6e4 >= s.idleMinutes &&
          !(d.idle.length && !d.idle[d.idle.length - 1].to)
        ) {
          d.idle.push({
            from: d.lastMoveAt,
            lat: b.lat,
            lng: b.lng,
            to: null,
          });
        }
      } else {
        d.path.push([b.lat, b.lng, now()]);
      }
      d.lastLat = b.lat;
      d.lastLng = b.lng;
    }
    t.data = { ...d };
    await this.db.recs.save(t);
    return {
      distanceKm: round2(d.distanceM / 1000),
      idleEvents: d.idle.length,
    };
  }

  /** Ending the trip auto-generates the travel claim: distance × fixed rate per km (+ optional bills). */
  @Post('stop')
  async stop(
    @Me() u: User,
    @Body() b: { bills?: { name: string; amount: number; url?: string }[] },
  ) {
    const t = (
      await this.db.listRec('TRIP', { ownerId: u.id, status: 'ACTIVE' })
    )[0];
    if (!t) throw new BadRequestException('No active trip');
    t.status = 'ENDED';
    t.data = { ...t.data, endedAt: now() };
    await this.db.recs.save(t);
    const km = round2(t.data.distanceM / 1000);
    if (km <= 0 && !b?.bills?.length) return { trip: t, claim: null };
    return {
      trip: t,
      claim: await createClaim(this.db, this.ap, this.n, u, {
        tripId: t.id,
        distanceKm: km,
        bills: b?.bills || [],
      }),
    };
  }

  @Get('trips')
  async trips(@Me() u: User) {
    return this.db.listRec('TRIP', { ownerId: u.id });
  }

  @Get('live')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER', 'ADMIN')
  async live(@Me() u: User) {
    const ids =
      HRS.includes(u.role) || ADMINS.includes(u.role)
        ? null
        : (await this.db.teamOf(u.id)).map((x) => x.id);
    const act = (
      await this.db.listRec('TRIP', {
        companyId: u.companyId,
        status: 'ACTIVE',
      })
    ).filter((t) => !ids || ids.includes(t.ownerId));
    return Promise.all(
      act.map(async (t) => ({
        userId: t.ownerId,
        name: (await this.db.user(t.ownerId)).name,
        lat: t.data.lastLat,
        lng: t.data.lastLng,
        map: t.data.lastLat ? mapUrl(t.data.lastLat, t.data.lastLng) : null,
        distanceKm: round2(t.data.distanceM / 1000),
        idle: t.data.idle.filter((i: any) => !i.to).length > 0,
        locationOffSince: t.data.offSince,
        lastPingAt: t.data.lastPingAt,
      })),
    );
  }
}

@Ctl('claims')
@Feat('tracking')
export class ClaimsCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
    private n: Notifier,
  ) {}

  @Post()
  async create(
    @Me() u: User,
    @Body()
    b: {
      title?: string;
      bills: { name: string; amount: number; url?: string }[];
    },
  ) {
    if (!b.bills?.length) throw new BadRequestException('Attach at least one bill');
    return createClaim(this.db, this.ap, this.n, u, {
      bills: b.bills,
      title: b.title || 'Reimbursement',
    });
  }

  @Get('mine')
  async mine(@Me() u: User) {
    return Promise.all(
      (
        await this.db.approvals.find({
          where: { requesterId: u.id, type: 'CLAIM' },
          order: { createdAt: 'DESC' },
        })
      ).map((a) => this.ap.view(a)),
    );
  }

  @Post(':id/bills')
  async addBills(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { bills: any[] },
  ) {
    const a = await this.db.approvals.findOneByOrFail({
      id,
      requesterId: u.id,
      type: 'CLAIM',
    });
    if (a.status !== 'PENDING' || a.step > 0) {
      throw new BadRequestException('Bills can only be added before the RM acts');
    }
    const bills = [...a.payload.bills, ...b.bills],
      reimb = round2(
        bills.reduce((x: number, y: any) => x + Number(y.amount), 0),
      );
    a.payload = {
      ...a.payload,
      bills,
      reimbursementAmount: reimb,
      total: round2(a.payload.travelAmount + reimb),
      overLimit: a.payload.travelAmount + reimb > a.payload.limit,
    };
    return this.db.approvals.save(a);
  }

  @Get('rules')
  async rules(@Me() u: User) {
    const s = cfg(await this.db.company(u.companyId));
    return { ratePerKm: s.ratePerKm, claimLimit: s.claimLimit };
  }

  @Put('rules')
  @Roles('HR', 'HR_MANAGER', 'ADMIN')
  async setRules(
    @Me() u: User,
    @Body() b: { ratePerKm?: number; claimLimit?: number },
  ) {
    const c = await this.db.company(u.companyId);
    c.settings = {
      ...cfg(c),
      ...(b.ratePerKm !== undefined && { ratePerKm: b.ratePerKm }),
      ...(b.claimLimit !== undefined && { claimLimit: b.claimLimit }),
    };
    await this.db.companies.save(c);
    await this.n.send(
      await this.db.ids(u.companyId, [
        'EMPLOYEE',
        'RM',
        ...HRS,
        'FINANCE',
        'DEPT_HEAD',
      ]),
      {
        title: 'Travel claim rules updated',
        body: `₹${cfg(c).ratePerKm}/km · limit ₹${cfg(c).claimLimit} per claim`,
        type: 'CLAIM',
      },
    );
    return { ratePerKm: cfg(c).ratePerKm, claimLimit: cfg(c).claimLimit };
  }

  @Post(':id/pay')
  @Roles('FINANCE')
  async pay(@Me() u: User, @Param('id') id: string) {
    const a = await this.db.approvals.findOneByOrFail({
      id,
      companyId: u.companyId,
      type: 'CLAIM',
    });
    if (a.status !== 'APPROVED') {
      throw new BadRequestException('Only fully approved claims can be paid');
    }
    a.payload = { ...a.payload, paid: true, paidAt: now() };
    await this.db.approvals.save(a);
    await this.n.send(a.requesterId, {
      title: `Claim paid: ₹${a.payload.total}`,
      type: 'CLAIM',
      sms: true,
    });
    return a;
  }

  @Get('finance-queue')
  @Roles('FINANCE')
  async queue(@Me() u: User) {
    return (
      await this.db.approvals.find({
        where: { companyId: u.companyId, type: 'CLAIM', status: 'APPROVED' },
      })
    ).filter((a) => !a.payload.paid);
  }
}
