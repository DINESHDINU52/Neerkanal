import {
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Like } from 'typeorm';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { Company, User, Attendance } from '../../database/entities';
import { Ctl, Roles, Feat, Me, Public } from '../../common/decorators/auth.decorators';
import { HRS, ADMINS, MOODS, cfg } from '../../common/constants';
import {
  now,
  ymd,
  ym,
  round2,
  hav,
  mapUrl,
  mapEmbed,
} from '../../common/utils';

export async function moodReport(
  db: Db,
  companyId: string,
  date: string,
  rmId?: string,
) {
  const people = rmId
      ? await db.teamOf(rmId)
      : await db.employees(companyId),
    rows = await db.att.find({ where: { companyId, date } });
  const mine = rows.filter(
      (r) => people.some((p) => p.id === r.userId) && r.mood,
    ),
    counts: any = {};
  mine.forEach((r) => (counts[r.mood] = (counts[r.mood] || 0) + 1));
  const avg = mine.length
    ? round2(
        mine.reduce((s, r) => s + (MOODS[r.mood] || 3), 0) / mine.length,
      )
    : null;
  return {
    date,
    teamSize: people.length,
    responded: mine.length,
    counts,
    enthusiasmScore: avg,
    concerns: mine
      .filter((r) => (MOODS[r.mood] || 3) <= 2)
      .map((r) => people.find((p) => p.id === r.userId)?.name),
  };
}

@Ctl('attendance')
@Feat('attendance')
export class AttendanceCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
    private n: Notifier,
  ) {}

  @Get('mood-options')
  moods() {
    return Object.keys(MOODS).map((k) => ({
      code: k,
      emoji: {
        EXCITED: '😄',
        GOOD: '🙂',
        OKAY: '😐',
        STRESSED: '😟',
        TIRED: '😴',
      }[k],
      label: k[0] + k.slice(1).toLowerCase(),
    }));
  }

  /** Core punch used by app / face / geo / device. Late, WFH, out-of-geofence become RM requests with lat/lng + Google Maps preview. */
  async register(
    u: User,
    c: Company,
    o: {
      type: 'IN' | 'OUT';
      mode: string;
      at?: Date;
      lat?: number;
      lng?: number;
      mood?: string;
      wfh?: boolean;
      reason?: string;
      faceScore?: number;
    },
  ) {
    const s = cfg(c),
      at = o.at || new Date(),
      date = ymd(at),
      time = at.toISOString();
    let r = await this.db.att.findOneBy({ userId: u.id, date });
    if (o.type === 'OUT') {
      if (!r?.inAt) throw new BadRequestException('No punch-in found for today');
      r.outAt = time;
      await this.db.att.save(r);
      return {
        ...r,
        hours: round2((+new Date(time) - +new Date(r.inAt)) / 36e5),
      };
    }
    if (r?.inAt) throw new ConflictException('Already punched in today');
    if (o.mode === 'FACE' && (o.faceScore ?? 0) < s.faceThreshold) {
      throw new BadRequestException(
        'Face not recognised — try again or use app button',
      );
    }
    let kind: string | null = null,
      dist: number | null = null;
    if (o.wfh) kind = 'WFH';
    else if (
      o.mode === 'GEO' ||
      (s.geofences.length &&
        o.lat !== undefined &&
        !['BIOMETRIC', 'DOOR_FACE', 'CCTV'].includes(o.mode))
    ) {
      if (o.lat === undefined || o.lng === undefined) {
        throw new BadRequestException(
          'Location required for geo-fenced attendance',
        );
      }
      if (s.geofences.length) {
        dist = Math.min(
          ...s.geofences.map(
            (g: any) => hav(o.lat!, o.lng!, g.lat, g.lng) - g.radiusM,
          ),
        );
        if (dist > 0) kind = 'OUT_OF_GEOFENCE';
      }
    }
    const [hh, mm] = s.shiftStart.split(':').map(Number),
      lim = new Date(at);
    lim.setHours(hh, mm + s.graceMin, 0, 0);
    if (!kind && at > lim) kind = 'LATE';
    r = r || this.db.att.create({ userId: u.id, companyId: u.companyId, date });
    Object.assign(r, {
      inAt: time,
      mode: o.mode,
      lat: o.lat ?? 0,
      lng: o.lng ?? 0,
      mood: o.mood,
      status: kind || 'PRESENT',
      flags: { pending: !!kind },
    });
    await this.db.att.save(r);
    let request: any = null;
    if (kind) {
      const hasLoc = o.lat !== undefined && o.lng !== undefined;
      request = await this.ap.create(
        'ATT_REQ',
        u,
        {
          date,
          kind,
          toStatus:
            kind === 'WFH' ? 'WFH' : kind === 'LATE' ? 'LATE' : 'OUT_OF_GEOFENCE',
          reason: o.reason,
          lat: o.lat,
          lng: o.lng,
          mapUrl: hasLoc ? mapUrl(o.lat!, o.lng!) : null,
          mapPreview: hasLoc ? mapEmbed(o.lat!, o.lng!) : null,
          metersOutside:
            dist && dist > 0 ? Math.round(dist) : undefined,
        },
        ['RM'],
        `${kind.replace(/_/g, ' ')} request — ${u.name} (${date})`,
      );
    }
    return {
      attendance: r,
      request: request && { id: request.id, pendingWith: 'RM' },
      moodPrompt: s.moodBot && !o.mood,
    };
  }

  @Post('punch')
  async punch(@Me() u: User, @Body() b: any) {
    return this.register(u, await this.db.company(u.companyId), {
      ...b,
      type: b.type || 'IN',
      mode: b.mode || 'APP',
    });
  }

  @Post('mood')
  async mood(@Me() u: User, @Body() b: { mood: string }) {
    if (!MOODS[b.mood]) throw new BadRequestException('Unknown mood');
    const r = await this.db.att.findOneBy({ userId: u.id, date: ymd() });
    if (!r) throw new BadRequestException('Punch in first');
    r.mood = b.mood;
    return this.db.att.save(r);
  }

  /** Biometric / door face recognition / CCTV devices push punches here using the company device key. */
  @Public()
  @Post('device')
  async device(
    @Body()
    b: {
      deviceKey: string;
      empId: string;
      ts?: string;
      mode?: string;
      deviceId?: string;
    },
  ) {
    const c = await this.db.companies.findOneBy({ deviceKey: b.deviceKey });
    if (!c) throw new UnauthorizedException('Bad device key');
    const u = await this.db.users.findOneBy({
      companyId: c.id,
      empId: b.empId,
    });
    if (!u) throw new NotFoundException('Unknown employee');
    const at = b.ts ? new Date(b.ts) : new Date(),
      r = await this.db.att.findOneBy({ userId: u.id, date: ymd(at) });
    return this.register(u, c, {
      type: r?.inAt ? 'OUT' : 'IN',
      mode: b.mode || 'BIOMETRIC',
      at,
    });
  }

  @Get('mine')
  mine(@Me() u: User, @Query('month') m = ym()) {
    return this.db.att.find({
      where: { userId: u.id, date: Like(m + '%') },
      order: { date: 'ASC' },
    });
  }

  @Get('team')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER', 'ADMIN')
  async team(@Me() u: User, @Query('date') d = ymd()) {
    const people =
      HRS.includes(u.role) || ADMINS.includes(u.role)
        ? await this.db.employees(u.companyId)
        : await this.db.teamOf(u.id);
    const rows = await this.db.att.find({
      where: { companyId: u.companyId, date: d },
    });
    return people.map((p) => {
      const r = rows.find((x) => x.userId === p.id);
      return {
        id: p.id,
        name: p.name,
        empId: p.empId,
        status: r?.status || 'NOT_MARKED',
        inAt: r?.inAt,
        outAt: r?.outAt,
        mood: r?.mood,
        mode: r?.mode,
        pendingApproval: r?.flags?.pending,
      };
    });
  }

  @Post('requests')
  async request(
    @Me() u: User,
    @Body()
    b: {
      kind: 'REGULARIZATION' | 'WFH' | 'LATE' | 'GEO';
      date: string;
      reason: string;
      inAt?: string;
      outAt?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    if (!b.reason) throw new BadRequestException('Reason required');
    const hasLoc = b.lat !== undefined && b.lng !== undefined;
    return this.ap.create(
      'ATT_REQ',
      u,
      {
        ...b,
        toStatus: b.kind === 'WFH' ? 'WFH' : 'PRESENT',
        mapUrl: hasLoc ? mapUrl(b.lat!, b.lng!) : null,
        mapPreview: hasLoc ? mapEmbed(b.lat!, b.lng!) : null,
      },
      ['RM'],
      `${b.kind} request — ${u.name} (${b.date})`,
    );
  }

  @Get('mood-report')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER')
  async moodReport(@Me() u: User, @Query('date') d = ymd()) {
    return moodReport(
      this.db,
      u.companyId,
      d,
      HRS.includes(u.role) ? undefined : u.id,
    );
  }

  /* Show-cause notices (3 days uninformed absence → day 4 notice → 7 days no reply → termination initiated) */
  @Get('showcause')
  async sc(@Me() u: User) {
    return this.db.listRec(
      'SHOWCAUSE',
      HRS.includes(u.role)
        ? { companyId: u.companyId }
        : { ownerId: u.id },
    );
  }

  @Post('showcause/:id/respond')
  async scRespond(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { response: string },
  ) {
    const r = await this.db.rec('SHOWCAUSE', id);
    if (r.ownerId !== u.id) throw new ForbiddenException();
    r.status = 'RESPONDED';
    r.data = { ...r.data, response: b.response, respondedAt: now() };
    await this.db.recs.save(r);
    await this.n.send([u.rmId, ...(await this.db.ids(u.companyId, HRS))], {
      title: `Show-cause reply from ${u.name}`,
      type: 'DISCIPLINE',
    });
    return r;
  }
}
