import {
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Like } from 'typeorm';
import { Db } from '../../database/database.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { moodReport } from '../attendance/attendance.controller';
import { ym, ymd, round2, csv } from '../../common/utils';

@Ctl('reports')
@Feat('reports')
@Roles('HR', 'HRBP', 'HR_MANAGER', 'ADMIN', 'FINANCE', 'RM')
export class ReportsCtl {
  constructor(private db: Db) {}

  @Get(':name')
  async report(
    @Me() u: User,
    @Param('name') name: string,
    @Query('month') m = ym(),
    @Query('format') f: string,
    @Res() res: any,
  ) {
    const cid = u.companyId;
    let rows: any[] = [];
    const emps = await this.db.users.find({
      where: { companyId: cid, kind: 'EMPLOYEE' },
    });
    if (name === 'headcount') {
      const by: any = {};
      emps
        .filter((e) => e.active)
        .forEach((e) => {
          const k = e.department || 'Unassigned';
          by[k] = (by[k] || 0) + 1;
        });
      rows = Object.entries(by).map(([department, headcount]) => ({
        department,
        headcount,
      }));
    } else if (name === 'attendance') {
      const att = await this.db.att.find({
        where: { companyId: cid, date: Like(m + '%') },
      });
      rows = emps.map((e) => {
        const a = att.filter((x) => x.userId === e.id),
          c = (s: string) => a.filter((x) => x.status === s).length;
        return {
          empId: e.empId,
          name: e.name,
          present: c('PRESENT'),
          late: c('LATE'),
          wfh: c('WFH'),
          outOfGeofence: c('OUT_OF_GEOFENCE'),
          leave: c('LEAVE'),
          absent: c('ABSENT') + c('LOP'),
        };
      });
    } else if (name === 'attrition') {
      const ex = await this.db.listRec('EXIT', { companyId: cid });
      rows = [
        {
          exits: ex.length,
          closed: ex.filter((x) => x.status === 'CLOSED').length,
          activeHeadcount: emps.filter((e) => e.active).length,
          attritionPct: emps.length
            ? round2((ex.length / emps.length) * 100)
            : 0,
        },
      ];
    } else if (name === 'hiring-funnel') {
      const apps = await this.db.apps.find({ where: { companyId: cid } }),
        by: any = {};
      apps.forEach((a) => (by[a.status] = (by[a.status] || 0) + 1));
      rows = Object.entries(by).map(([stage, count]) => ({ stage, count }));
    } else if (name === 'payroll-cost') {
      rows = (await this.db.listRec('PAYRUN', { companyId: cid })).map((r) => ({
        month: r.key,
        status: r.status,
        ...r.data.totals,
      }));
    } else if (name === 'mood') {
      rows = [await moodReport(this.db, cid, ymd())];
    } else if (name === 'leave-utilisation') {
      const ap = await this.db.approvals.find({
          where: { companyId: cid, type: 'LEAVE', status: 'APPROVED' },
        }),
        by: any = {};
      ap.forEach(
        (a) => (by[a.payload.code] = (by[a.payload.code] || 0) + a.payload.days),
      );
      rows = Object.entries(by).map(([code, days]) => ({ code, days }));
    } else if (name === 'claims') {
      rows = (
        await this.db.approvals.find({
          where: { companyId: cid, type: 'CLAIM' },
        })
      ).map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        total: a.payload.total,
        paid: a.payload.paid,
        overLimit: a.payload.overLimit,
      }));
    } else if (name === 'kpi') {
      rows = (
        await this.db.listRec('KPI', { companyId: cid, key: m })
      ).map((k) => ({
        employeeId: k.ownerId,
        month: k.key,
        status: k.status,
        scorePct: k.data.scorePct,
      }));
    } else if (name === 'training') {
      rows = (
        await this.db.listRec('TRAINING', { companyId: cid })
      ).map((t) => ({
        employeeId: t.ownerId,
        title: t.data.title,
        provider: t.data.provider,
        status: t.status,
      }));
    } else if (name === 'policy-acks') {
      rows = (await this.db.listRec('POLICY', { companyId: cid })).map((p) => ({
        policy: p.data.title,
        status: p.status,
      }));
    } else {
      throw new BadRequestException(
        'Reports: headcount, attendance, attrition, hiring-funnel, payroll-cost, mood, leave-utilisation, claims, kpi, training, policy-acks',
      );
    }
    if (f === 'csv') {
      const h = rows[0] ? Object.keys(rows[0]) : [];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${name}_${m}.csv"`,
      );
      return res.send(csv([h, ...rows.map((r) => h.map((k) => r[k]))]));
    }
    res.json({ report: name, month: m, rows });
  }
}
