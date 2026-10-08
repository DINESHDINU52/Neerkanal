import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Db } from '../../../database/database.service';
import { Notifier, BASE_URL } from './notifier.service';
import { User, Approval, Attendance } from '../../../database/entities';
import { HRS, ADMINS } from '../../../common/constants';
import { now, ymd, addDays, round2, rid, P } from '../../../common/utils';

const log = new Logger('Approvals');

/** Generic multi-step approval engine used by leave, attendance requests, requisitions, claims, rewards, resignation, termination. */
@Injectable()
export class Approvals {
  constructor(
    private db: Db,
    private n: Notifier,
  ) {}

  private expand(role: string) {
    return role === 'HR' ? HRS : role === 'ADMIN' ? ADMINS : [role];
  }

  async approvers(a: Approval, step = a.step): Promise<User[]> {
    const role = a.chain[step],
      req = await this.db.users.findOneBy({ id: a.requesterId });
    if (role === 'RM' && req?.rmId) {
      return [await this.db.users.findOneBy({ id: req.rmId })].filter(Boolean) as User[];
    }
    if (role === 'HRBP' && req?.hrbpId) {
      return [await this.db.users.findOneBy({ id: req.hrbpId })].filter(Boolean) as User[];
    }
    const roles = role === 'RM' ? [...HRS] : this.expand(role);
    return this.db.byRole(a.companyId, roles);
  }

  async create(
    type: string,
    req: User,
    payload: any,
    chain: string[],
    title: string,
  ) {
    const a = await this.db.approvals.save(
      this.db.approvals.create({
        companyId: req.companyId,
        type,
        requesterId: req.id,
        title,
        chain,
        payload,
        step: 0,
        status: 'PENDING',
        history: [],
      }),
    );
    await this.notifyStep(a);
    return a;
  }

  async notifyStep(a: Approval) {
    const ap = await this.approvers(a);
    await this.n.send(
      ap.map((x) => x.id),
      {
        title: `Approval needed: ${a.title}`,
        body: `Step ${a.step + 1}/${a.chain.length} (${a.chain[a.step]})`,
        type: 'APPROVAL',
        link: `/approvals/${a.id}`,
        sms: a.type === 'LEAVE',
      },
    );
  }

  async canAct(a: Approval, u: User) {
    return (
      u.role === 'SUPER_ADMIN' ||
      (await this.approvers(a)).some((x) => x.id === u.id)
    );
  }

  async view(a: Approval) {
    const pendingWith = a.status === 'PENDING' ? a.chain[a.step] : null;
    return {
      ...a,
      pendingWith,
      pendingWithNames: pendingWith
        ? (await this.approvers(a)).map((x) => x.name)
        : [],
    };
  }

  async act(id: string, actor: User, approve: boolean, remarks = '') {
    const a = await this.db.approvals.findOneBy({ id });
    if (!a) throw new NotFoundException('Approval not found');
    if (a.status !== 'PENDING') throw new BadRequestException(`Already ${a.status}`);
    if (a.companyId !== actor.companyId && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException();
    }
    if (!(await this.canAct(a, actor))) {
      throw new ForbiddenException('This is not your approval step');
    }

    a.history = [
      ...(a.history || []),
      {
        step: a.step,
        role: a.chain[a.step],
        by: actor.id,
        byName: actor.name,
        decision: approve ? 'APPROVED' : 'REJECTED',
        remarks,
        at: now(),
      },
    ];

    if (!approve) {
      a.status = 'REJECTED';
      await this.db.approvals.save(a);
      if (a.type === 'ATT_REQ') {
        const r = await this.db.users.findOneBy({ id: a.requesterId });
        if (r) {
          await this.markAtt(r.id, r.companyId, a.payload.date, {
            status: 'ABSENT',
            flags: { rejected: true },
          });
        }
      }
      await this.n.send(a.requesterId, {
        title: `Rejected: ${a.title}`,
        body: remarks,
        type: 'APPROVAL',
        link: `/approvals/${a.id}`,
        sms: true,
      });
      return a;
    }

    if (a.step + 1 >= a.chain.length) {
      a.status = 'APPROVED';
      await this.db.approvals.save(a);
      try {
        await this.hooks(a);
      } catch (e: any) {
        log.error('approval hook failed: ' + e.stack);
      }
      await this.n.send(a.requesterId, {
        title: `Approved: ${a.title}`,
        body: remarks,
        type: 'APPROVAL',
        link: `/approvals/${a.id}`,
        sms: true,
      });
    } else {
      a.step += 1;
      await this.db.approvals.save(a);
      await this.notifyStep(a);
      await this.n.send(a.requesterId, {
        title: `${a.title}: moved to ${a.chain[a.step]}`,
        body: 'Previous step approved',
        type: 'APPROVAL',
        link: `/approvals/${a.id}`,
      });
    }
    return a;
  }

  async markAtt(
    userId: string,
    companyId: string,
    date: string,
    patch: Partial<Attendance>,
  ) {
    let r = await this.db.att.findOneBy({ userId, date });
    if (!r) r = this.db.att.create({ userId, companyId, date, flags: {} });
    Object.assign(r, patch);
    return this.db.att.save(r);
  }

  async hooks(a: Approval) {
    const p = a.payload || {},
      u = await this.db.user(a.requesterId);
    switch (a.type) {
      case 'LEAVE': {
        const year = String(P(p.from).getFullYear());
        const b = await this.db.leaveBal.findOneBy({
          userId: u.id,
          code: p.code,
          year,
        });
        if (b) {
          b.bal = round2(b.bal - p.days);
          await this.db.leaveBal.save(b);
        }
        for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
          await this.markAtt(u.id, u.companyId, d, {
            status: p.paid === false ? 'LOP' : 'LEAVE',
            mode: 'LEAVE',
          });
        }
        break;
      }
      case 'COMPOFF': {
        const year = String(new Date().getFullYear());
        let b = await this.db.leaveBal.findOneBy({
          userId: u.id,
          code: 'CO',
          year,
        });
        if (!b) b = this.db.leaveBal.create({ userId: u.id, code: 'CO', year, bal: 0 });
        b.bal = round2(b.bal + (p.days || 1));
        await this.db.leaveBal.save(b);
        break;
      }
      case 'ATT_REQ':
        await this.markAtt(u.id, u.companyId, p.date, {
          status: p.toStatus || 'PRESENT',
          flags: { approved: true, kind: p.kind },
          ...(p.inAt ? { inAt: p.inAt, outAt: p.outAt } : {}),
        });
        break;
      case 'RESIGNATION':
      case 'TERMINATION': {
        const hrbp = u.hrbpId || (await this.db.ids(u.companyId, HRS))[0];
        const ex = await this.db.addRec('EXIT', {
          companyId: u.companyId,
          ownerId: u.id,
          status: 'NOTICE',
          data: {
            kind: a.type,
            reason: p.reason,
            requestedLwd: p.lwd,
            clearances: { KT: null, ASSET: null, ACCESS: null },
            letters: {},
          },
        });
        const when = new Date(Date.now() + 864e5);
        when.setHours(15, 0, 0, 0);
        await this.meets(
          u.companyId,
          hrbp,
          'EXIT_INTERVIEW',
          `Exit interview — ${u.name}`,
          when.toISOString(),
          30,
          [u.id, hrbp],
          { exitId: ex.id },
        );
        await this.n.send(await this.db.ids(u.companyId, HRS), {
          title: `Exit initiated: ${u.name}`,
          body: 'Set notice period / last working day',
          type: 'EXIT',
          link: `/exit/${ex.id}`,
        });
        break;
      }
      case 'REWARD':
        await this.n.send(a.requesterId, {
          title: 'Reward released to payroll/finance',
          type: 'REWARD',
        });
        break;
    }
  }

  /** Create a Meet-style meeting (also blocks calendars) and invite everyone by in-app + email + SMS. */
  async meets(
    companyId: string,
    hostId: string,
    kind: string,
    title: string,
    startsAt: string,
    durationMin: number,
    attendeeIds: string[],
    ctx: any = {},
  ) {
    const roomId = rid(10),
      link = `${BASE_URL()}/meet/${roomId}`;
    const m = await this.db.meetings.save(
      this.db.meetings.create({
        companyId,
        hostId,
        kind,
        title,
        startsAt,
        durationMin,
        roomId,
        link,
        attendeeIds: [...new Set([hostId, ...attendeeIds])],
        ctx,
        status: 'SCHEDULED',
      }),
    );
    await this.n.send(m.attendeeIds, {
      title: `Meeting: ${title}`,
      body: `${new Date(startsAt).toLocaleString()} · ${durationMin} min · Join: ${link}`,
      type: 'MEETING',
      link: `/meet/${roomId}`,
      sms: true,
    });
    return m;
  }
}
