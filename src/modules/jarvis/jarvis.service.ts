import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { In } from 'typeorm';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { User, Job } from '../../database/entities';
import { LeaveCtl } from '../leave/leave.controller';
import { AttendanceCtl, moodReport } from '../attendance/attendance.controller';
import { ApprovalsCtl } from '../approvals/approvals.controller';
import { JobsCtl } from '../jobs/jobs.controller';
import { CandidateCtl } from '../candidate/candidate.controller';
import { AtsCtl } from '../ats/ats.controller';
import { PayrollCtl } from '../payroll/payroll.controller';
import { ComplaintsCtl } from '../complaints/complaints.controller';
import { HRS, MOODS } from '../../common/constants';
import { ENV, ymd, ym, horoscope } from '../../common/utils';

type Tool = {
  name: string;
  description: string;
  props: Record<string, any>;
  required?: string[];
  roles?: string[];
  feature?: string;
};

const T = (
  name: string,
  description: string,
  props: any = {},
  required: string[] = [],
  roles?: string[],
  feature?: string,
): Tool => ({ name, description, props, required, roles, feature });

const str = (d = '') => ({ type: 'string', description: d });

@Injectable()
export class Jarvis {
  private tools: Tool[] = [
    T('leave_balance', 'Get my leave balances', {}, [], undefined, 'leave'),
    T(
      'apply_leave',
      'Apply for leave. Dates are YYYY-MM-DD. Code like CL, SL, PL.',
      { code: str(), from: str(), to: str(), reason: str(), proofUrl: str() },
      ['code', 'from', 'reason'],
      undefined,
      'leave',
    ),
    T(
      'punch',
      'Mark my attendance (IN or OUT)',
      {
        type: { type: 'string', enum: ['IN', 'OUT'] },
        mood: { type: 'string', enum: Object.keys(MOODS) },
      },
      ['type'],
      undefined,
      'attendance',
    ),
    T('pending_approvals', 'List approvals waiting for me'),
    T(
      'decide_approval',
      'Approve or reject an approval by id. Confirm with the user before using.',
      { id: str(), approve: { type: 'boolean' }, remarks: str() },
      ['id', 'approve'],
    ),
    T('search_jobs', 'Search jobs (candidates only)', { q: str('title or skill') }, ['q'], ['CANDIDATE']),
    T('apply_job', 'Apply to a job by id (candidates only)', { jobId: str() }, ['jobId'], ['CANDIDATE']),
    T('start_mock_interview', 'Start a mock interview', { role: str() }, [], ['CANDIDATE']),
    T(
      'create_requisition',
      'Raise a manpower requisition',
      { title: str(), headcount: { type: 'number' }, justification: str() },
      ['title', 'headcount'],
      ['DEPT_HEAD', 'RM', 'HR_MANAGER'],
      'ats',
    ),
    T('payslip', 'Get my payslip for a month YYYY-MM', { month: str() }, [], undefined, 'payroll'),
    T('raise_complaint', 'Raise an anonymous complaint', { subject: str(), body: str() }, ['subject', 'body'], undefined, 'complaints'),
    T('team_mood', 'Daily mood report for my team (RM/HR)', { date: str() }, [], ['RM', ...HRS], 'attendance'),
    T(
      'schedule_meeting',
      'Schedule a meeting with colleagues by email',
      {
        title: str(),
        startsAt: str('ISO datetime'),
        emails: { type: 'array', items: { type: 'string' } },
      },
      ['title', 'startsAt', 'emails'],
    ),
    T('my_notifications', 'Show my unread notifications'),
    T('horoscope', "Today's horoscope for me"),
  ];

  constructor(
    private mr: ModuleRef,
    private db: Db,
    private ap: Approvals,
  ) {}

  private c<T>(k: new (...a: any[]) => T): T {
    return this.mr.get(k, { strict: false });
  }

  private async exec(name: string, a: any, u: User): Promise<any> {
    const t = this.tools.find((x) => x.name === name);
    if (!t) throw new BadRequestException('Unknown tool');
    if (t.roles && !t.roles.includes(u.role) && u.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(`Your role (${u.role}) cannot do that`);
    }
    if (
      t.feature &&
      u.companyId &&
      !(await this.db.company(u.companyId)).modules.includes(t.feature)
    ) {
      throw new ForbiddenException(`Module ${t.feature} is not purchased`);
    }
    switch (name) {
      case 'leave_balance':
        return this.c(LeaveCtl).balances(u);
      case 'apply_leave':
        return this.c(LeaveCtl).apply(u, a);
      case 'punch':
        return this.c(AttendanceCtl).punch(u, {
          type: a.type,
          mode: 'APP',
          mood: a.mood,
        });
      case 'pending_approvals':
        return this.c(ApprovalsCtl).inbox(u);
      case 'decide_approval':
        return this.ap.act(a.id, u, !!a.approve, a.remarks);
      case 'search_jobs':
        return (await this.c(JobsCtl).search(u, a.q, '')).results
          .slice(0, 8)
          .map((j: Job) => ({
            id: j.id,
            title: j.title,
            company: j.companyName,
            source: j.source,
            applyUrl: j.applyUrl,
          }));
      case 'apply_job':
        return this.c(JobsCtl).apply(u, a.jobId);
      case 'start_mock_interview':
        return this.c(CandidateCtl).mockStart(u, a);
      case 'create_requisition':
        return this.c(AtsCtl).req(u, a);
      case 'payslip':
        return this.c(PayrollCtl).payslip(u, a.month || ym());
      case 'raise_complaint':
        return this.c(ComplaintsCtl).raise(u, { ...a, anonymous: true });
      case 'team_mood':
        return moodReport(
          this.db,
          u.companyId,
          a.date || ymd(),
          HRS.includes(u.role) ? undefined : u.id,
        );
      case 'schedule_meeting': {
        const us = await this.db.users.find({
          where: {
            email: In((a.emails || []).map((e: string) => e.toLowerCase())),
            companyId: u.companyId,
          },
        });
        const m = await this.ap.meets(
          u.companyId,
          u.id,
          'MEETING',
          a.title,
          a.startsAt,
          30,
          us.map((x) => x.id),
        );
        return { link: m.link, invited: us.map((x) => x.name) };
      }
      case 'my_notifications':
        return (
          await this.db.notes.find({
            where: { userId: u.id, read: false },
            order: { createdAt: 'DESC' },
            take: 10,
          })
        ).map((n) => ({ title: n.title, body: n.body }));
      case 'horoscope':
        return u.zodiac
          ? horoscope(u.zodiac)
          : { error: 'No zodiac on profile' };
    }
  }

  async chat(u: User, message: string, history: any[] = []) {
    const actions: any[] = [];
    if (!ENV('ANTHROPIC_API_KEY')) {
      return {
        reply: await this.fallback(u, message, actions),
        actions,
        mode: 'rules (set ANTHROPIC_API_KEY for full Jarvis)',
      };
    }
    const sys = `You are Jarvis, the assistant inside Nerkanal (HRMS/ATS). You act on behalf of ${u.name} (role ${u.role}). Today is ${ymd()}. Use tools to take actions. Never invent ids or data — fetch them with tools first. Ask for confirmation before approving/rejecting, raising complaints, or any irreversible step. Be brief.`;
    const msgs: any[] = [
        ...history.slice(-10),
        { role: 'user', content: message },
      ],
      tools = this.tools
        .filter(
          (t) =>
            !t.roles || t.roles.includes(u.role) || u.role === 'SUPER_ADMIN',
        )
        .map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: {
            type: 'object',
            properties: t.props,
            required: t.required,
          },
        }));
    for (let i = 0; i < 6; i++) {
      const r: any = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ENV('ANTHROPIC_API_KEY'),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ENV('JARVIS_MODEL', 'claude-sonnet-5-5'),
          max_tokens: 1024,
          system: sys,
          tools,
          messages: msgs,
        }),
      }).then((x) => x.json());
      if (r.error) {
        throw new BadRequestException('Jarvis LLM error: ' + r.error.message);
      }
      const uses = (r.content || []).filter((b: any) => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !uses.length) {
        return {
          reply: (r.content || [])
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('\n'),
          actions,
          history: [...msgs, { role: 'assistant', content: r.content }],
        };
      }
      msgs.push({ role: 'assistant', content: r.content });
      const results: any[] = [];
      for (const b of uses) {
        let out: any;
        try {
          out = await this.exec(b.name, b.input || {}, u);
        } catch (e: any) {
          out = { error: e.response?.message || e.message };
        }
        actions.push({ tool: b.name, input: b.input, ok: !out?.error });
        results.push({
          type: 'tool_result',
          tool_use_id: b.id,
          content: JSON.stringify(out).slice(0, 6000),
        });
      }
      msgs.push({ role: 'user', content: results });
    }
    return { reply: 'I could not finish that — please try again.', actions };
  }

  private async fallback(u: User, m: string, actions: any[]) {
    const s = m.toLowerCase(),
      run = async (n: string, a: any = {}) => {
        actions.push({ tool: n });
        try {
          return await this.exec(n, a, u);
        } catch (e: any) {
          return { error: e.response?.message || e.message };
        }
      };
    if (/balance/.test(s)) return JSON.stringify(await run('leave_balance'));
    if (/pending|approval/.test(s)) {
      return JSON.stringify((await run('pending_approvals')) || []);
    }
    if (/punch in|check in|mark attendance/.test(s)) {
      return JSON.stringify(await run('punch', { type: 'IN' }));
    }
    if (/punch out|check out/.test(s)) {
      return JSON.stringify(await run('punch', { type: 'OUT' }));
    }
    if (/horoscope/.test(s)) return JSON.stringify(await run('horoscope'));
    if (/notification/.test(s)) {
      return JSON.stringify(await run('my_notifications'));
    }
    if (/payslip|salary/.test(s)) return JSON.stringify(await run('payslip'));
    if (/mood/.test(s)) return JSON.stringify(await run('team_mood'));
    return 'I can do: leave balance, pending approvals, punch in/out, horoscope, notifications, payslip, team mood. Add ANTHROPIC_API_KEY to unlock full natural-language actions (apply leave, search/apply jobs, raise requisition, schedule meetings…).';
  }
}
