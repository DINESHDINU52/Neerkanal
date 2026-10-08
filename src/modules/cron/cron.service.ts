import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Db } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { Approvals } from '../core/services/approvals.service';
import { ExternalJobs } from '../core/services/external-jobs.service';
import { moodReport } from '../attendance/attendance.controller';
import { scheduleOneOnOnes } from '../engagement/engagement.controller';
import { creditYear } from '../leave/leave.controller';
import { HRS, cfg } from '../../common/constants';
import {
  ENV,
  ymd,
  ym,
  now,
  addDays,
  diffDays,
  P,
} from '../../common/utils';

@Injectable()
export class CronService {
  constructor(
    private db: Db,
    private n: Notifier,
    private ap: Approvals,
    private ext: ExternalJobs,
  ) {}

  private async companies() {
    return this.db.companies.find();
  }

  /** 08:00 — probation ending in 2 days → HR (confirm or start separation) */
  @Cron('0 8 * * *')
  async probation() {
    for (const c of await this.companies()) {
      for (const e of await this.db.employees(c.id)) {
        if (
          e.probationState === 'ON' &&
          e.probationEnd &&
          diffDays(ymd(), e.probationEnd) === 2
        ) {
          await this.n.send(await this.db.ids(c.id, HRS), {
            title: `Probation ends in 2 days: ${e.name} (${e.empId})`,
            body: 'Confirm the employee or initiate separation',
            type: 'PROBATION',
            dedupe: `prob:${e.id}:${e.probationEnd}`,
            link: '/onboarding/probation',
            sms: true,
          });
        }
      }
    }
  }

  /** 00:30 — mark yesterday's absentees; 3 days uninformed → day-4 show-cause; no reply in 7 days → termination initiated */
  @Cron('30 0 * * *')
  async absence() {
    const y = addDays(ymd(), -1);
    for (const c of await this.companies()) {
      if (!(c.modules || []).includes('attendance')) continue;
      const s = cfg(c);
      for (const e of await this.db.employees(c.id)) {
        if (e.onboarding === 'PENDING' || (e.doj && e.doj > y)) continue;
        let streak = 0;
        for (let d = y, i = 0; i < 10; d = addDays(d, -1), i++) {
          if (s.weekOff.includes(P(d).getDay())) continue;
          const r = await this.db.att.findOneBy({ userId: e.id, date: d });
          if (r && ['LEAVE', 'LOP'].includes(r.status)) break;
          if (r?.inAt) break;
          if (d === y && !r) {
            await this.ap.markAtt(e.id, c.id, d, {
              status: 'ABSENT',
              mode: 'SYSTEM',
            });
          }
          streak++;
        }
        if (streak === 3) {
          // the 4th day starts today
          const sc = await this.db.addRec('SHOWCAUSE', {
            companyId: c.id,
            ownerId: e.id,
            status: 'OPEN',
            data: {
              issuedAt: now(),
              dueBy: addDays(ymd(), 7),
              reason: '3 consecutive days of uninformed absence',
            },
          });
          await this.n.send(
            [e.id, e.rmId, ...(await this.db.ids(c.id, HRS))].filter(
              Boolean,
            ) as string[],
            {
              title: `Show-cause notice: ${e.name}`,
              body: '3 days uninformed absence. Reply within 7 days.',
              type: 'DISCIPLINE',
              dedupe: `sc:${sc.id}`,
              link: `/attendance/showcause`,
              sms: true,
            },
          );
        }
      }
      for (const sc of await this.db.listRec('SHOWCAUSE', {
        companyId: c.id,
        status: 'OPEN',
      })) {
        if (diffDays(sc.createdAt, ymd()) >= 7) {
          sc.status = 'ESCALATED';
          await this.db.recs.save(sc);
          const e = await this.db.user(sc.ownerId);
          await this.ap.create(
            'TERMINATION',
            e,
            {
              reason:
                'No response to show-cause notice (uninformed absence) within 7 days',
            },
            ['HR_MANAGER'],
            `Termination initiated (policy): ${e.name}`,
          );
        }
      }
    }
  }

  /** 11:30 — daily mood report to every RM and to HR */
  @Cron('30 11 * * *')
  async mood() {
    for (const c of await this.companies()) {
      if (!c.modules?.includes('attendance')) continue;
      const d = ymd();
      for (const rm of await this.db.byRole(c.id, ['RM'])) {
        const r = await moodReport(this.db, c.id, d, rm.id);
        if (r.responded) {
          await this.n.send(rm.id, {
            title: `Team mood today: ${r.enthusiasmScore}/5`,
            body: `${r.responded}/${r.teamSize} responded. ${
              r.concerns.length
                ? 'Check in with: ' + r.concerns.join(', ')
                : ''
            }`,
            type: 'MOOD',
            dedupe: `mood:${rm.id}:${d}`,
            email: false,
          });
        }
      }
      const all = await moodReport(this.db, c.id, d);
      if (all.responded) {
        await this.n.send(await this.db.ids(c.id, HRS), {
          title: `Company mood today: ${all.enthusiasmScore}/5`,
          body: JSON.stringify(all.counts),
          type: 'MOOD',
          dedupe: `mood:hr:${c.id}:${d}`,
          email: false,
        });
      }
    }
  }

  /** every minute — live-tracking watchdog (location off → RM, still off after 30 min → HR) + water snoozes */
  @Cron('* * * * *')
  async minute() {
    for (const t of await this.db.recs.find({
      where: { type: 'TRIP', status: 'ACTIVE' },
    })) {
      const d = t.data,
        c = await this.db.companies.findOneBy({ id: t.companyId }),
        s = cfg(c),
        u = await this.db.users.findOneBy({ id: t.ownerId });
      if (!u) continue;
      const silent = Date.now() - +new Date(d.lastPingAt) > 3 * 6e4;
      if ((silent || d.enabled === false) && !d.offSince) d.offSince = now();
      if (d.offSince) {
        if (!d.rmNotified) {
          d.rmNotified = true;
          await this.n.send(u.rmId || (await this.db.ids(c!.id, HRS)), {
            title: `${u.name}: location off / no signal`,
            type: 'TRACKING',
            sms: true,
          });
        }
        if (
          !d.hrNotified &&
          (Date.now() - +new Date(d.offSince)) / 6e4 >=
            s.locationOffEscalateMin
        ) {
          d.hrNotified = true;
          await this.n.send(await this.db.ids(c!.id, HRS), {
            title: `ESCALATION: ${u.name} location off for ${s.locationOffEscalateMin}+ min`,
            type: 'TRACKING',
            sms: true,
          });
        }
        t.data = { ...d };
        await this.db.recs.save(t);
      }
    }
    for (const sn of await this.db.recs.find({
      where: { type: 'SNOOZE', status: 'OPEN' },
    })) {
      if (new Date(sn.data.dueAt) <= new Date()) {
        sn.status = 'DONE';
        await this.db.recs.save(sn);
        await this.n.send(sn.ownerId, {
          title: '💧 Time for water',
          body: 'Tap “Drank” or “Later”',
          type: 'WATER',
          email: false,
        });
      }
    }
  }

  /** every 2h in working hours — hydration nudge for employees who are in office today */
  @Cron('0 10-18/2 * * 1-6')
  async water() {
    const d = ymd(),
      h = new Date().getHours();
    for (const c of await this.companies()) {
      if (!c.modules?.includes('engagement')) continue;
      const ids = (
        await this.db.att.find({ where: { companyId: c.id, date: d } })
      )
        .filter((a) => a.inAt && !a.outAt)
        .map((a) => a.userId);
      await this.n.send(ids, {
        title: '💧 Hydration break',
        body: 'Have a glass of water',
        type: 'WATER',
        dedupe: `water:${d}:${h}`,
        email: false,
      });
    }
  }

  /** 09:00 on the 1st — RMs set KPIs; monthly 1:1s scheduled; every 2nd month skill-gap reminder */
  @Cron('0 9 1 * *')
  async monthStart() {
    for (const c of await this.companies()) {
      if (c.modules?.includes('performance')) {
        await this.n.send(await this.db.ids(c.id, ['RM']), {
          title: `Set ${ym()} KPIs for your team today`,
          body: 'Unset KPIs are forwarded to HR tomorrow',
          type: 'KPI',
          dedupe: `kpi1:${c.id}:${ym()}`,
        });
      }
      if (c.modules?.includes('engagement')) {
        await scheduleOneOnOnes(this.db, this.ap, c.id);
      }
      if (
        c.modules?.includes('training') &&
        new Date().getMonth() % 2 === 0
      ) {
        await this.n.send(await this.db.ids(c.id, ['RM']), {
          title: 'Bi-monthly skill-gap review due',
          body: 'Analyse your team and share skill gaps',
          type: 'TRAINING',
          dedupe: `sg:${c.id}:${ym()}`,
        });
      }
      if (c.modules?.includes('leave') && new Date().getMonth() === 0) {
        await creditYear(this.db, c.id);
      }
    }
  }

  /** 09:00 on the 2nd — KPIs still not set are forwarded to HR */
  @Cron('0 9 2 * *')
  async kpiEscalate() {
    for (const c of await this.companies()) {
      if (!c.modules?.includes('performance')) continue;
      for (const e of (await this.db.employees(c.id)).filter(
        (x) => x.rmId,
      )) {
        if (
          !(
            await this.db.listRec('KPI', {
              ownerId: e.id,
              key: ym(),
            })
          ).length
        ) {
          await this.n.send(await this.db.ids(c.id, HRS), {
            title: `KPI not set for ${e.name} (${ym()})`,
            body: 'Reporting manager missed the 1st-day deadline',
            type: 'KPI',
            dedupe: `kpi2:${e.id}:${ym()}`,
          });
        }
      }
    }
  }

  /** 09:00 daily — PIP ending in 2 days; POSH/training events in 7 days → HR */
  @Cron('0 9 * * *')
  async daily() {
    for (const c of await this.companies()) {
      if (c.modules?.includes('performance')) {
        for (const p of await this.db.listRec('PIP', {
          companyId: c.id,
          status: 'ACTIVE',
        })) {
          if (diffDays(ymd(), p.data.endDate) === 2) {
            const e = await this.db.user(p.ownerId);
            await this.n.send(
              [...(await this.db.ids(c.id, HRS)), e.rmId].filter(
                Boolean,
              ) as string[],
              {
                title: `PIP ends in 2 days: ${e.name}`,
                body: 'Record outcome: success / extend / separate',
                type: 'PIP',
                dedupe: `pip2:${p.id}:${p.data.endDate}`,
                link: `/performance/pip/${p.id}`,
                sms: true,
              },
            );
          }
        }
      }
      if (c.modules?.includes('training')) {
        for (const t of await this.db.listRec('TRAINING_CAL', {
          companyId: c.id,
        })) {
          if (diffDays(ymd(), t.key) === 7) {
            await this.n.send(await this.db.ids(c.id, HRS), {
              title: `Training in 7 days: ${t.data.title}`,
              body: t.key,
              type: 'TRAINING',
              dedupe: `tcal:${t.id}`,
            });
          }
        }
      }
    }
  }

  /** 06:00 — refresh external jobs for configured queries (JOB_SYNC_QUERIES="developer,accountant,sales") */
  @Cron('0 6 * * *')
  async jobs() {
    for (const q of ENV(
      'JOB_SYNC_QUERIES',
      'developer,marketing,sales,hr',
    ).split(',')) {
      await this.ext.search(q.trim());
    }
  }
}
