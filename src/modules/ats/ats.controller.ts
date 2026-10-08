import {
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { In } from 'typeorm';
import { Db, clean } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier, BASE_URL } from '../core/services/notifier.service';
import { Company, User } from '../../database/entities';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS, PLAN } from '../../common/constants';
import { now, ymd, addDays } from '../../common/utils';

export const offerHtml = (c: Company, cand: User, o: any) =>
  `<div style="font-family:Arial;max-width:720px;margin:auto"><h2 style="color:#0B1F4B">${c.name}</h2><p>Date: ${ymd()}</p><p>Dear ${cand.name},</p><p>We are delighted to offer you the position of <b>${o.designation}</b> with an annual CTC of <b>₹${Number(o.ctc).toLocaleString('en-IN')}</b>. Your expected date of joining is <b>${o.doj}</b>.</p><p>This offer is valid until ${o.expiresOn}. Please accept or decline it from your Nerkanal candidate portal.</p><p>Regards,<br/>HR Team, ${c.name}</p></div>`;

@Ctl('ats')
@Feat('ats')
export class AtsCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
    private n: Notifier,
  ) {}

  /* Step 1: manpower requisition raised by department manager/head → HR manager approves → assigned to recruiter */
  @Post('requisitions')
  @Roles('DEPT_HEAD', 'RM', 'HR_MANAGER')
  async req(
    @Me() u: User,
    @Body()
    b: {
      title: string;
      headcount: number;
      department?: string;
      skills?: string[];
      justification?: string;
      budget?: number;
    },
  ) {
    if (!b.title || !b.headcount) {
      throw new BadRequestException('title & headcount required');
    }
    return this.ap.create(
      'REQUISITION',
      u,
      { ...b, recruiterId: null },
      ['HR_MANAGER'],
      `Manpower request: ${b.title} ×${b.headcount}`,
    );
  }

  @Get('requisitions')
  async reqs(@Me() u: User) {
    const all = await this.db.approvals.find({
      where: { companyId: u.companyId, type: 'REQUISITION' },
      order: { createdAt: 'DESC' },
    });
    return all.filter(
      (a) =>
        [...HRS, 'ADMIN', 'SUPER_ADMIN'].includes(u.role) ||
        a.requesterId === u.id ||
        a.payload.recruiterId === u.id,
    );
  }

  @Post('requisitions/:id/assign')
  @Roles('HR_MANAGER', 'HR', 'HRBP')
  async assign(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { recruiterId: string },
  ) {
    const a = await this.db.approvals.findOneBy({
      id,
      companyId: u.companyId,
      type: 'REQUISITION',
    });
    if (!a) throw new NotFoundException();
    if (a.status !== 'APPROVED') {
      throw new BadRequestException('Requisition must be approved first');
    }
    const r = await this.db.user(b.recruiterId);
    if (r.role !== 'RECRUITER') throw new BadRequestException('Not a recruiter');
    a.payload = { ...a.payload, recruiterId: r.id };
    await this.db.approvals.save(a);
    await this.n.send([r.id, a.requesterId], {
      title: `Requisition assigned: ${a.payload.title}`,
      body: `Recruiter: ${r.name}`,
      type: 'ATS',
      link: `/ats/requisitions/${id}`,
    });
    return a;
  }

  @Get('recruiters')
  @Roles('HR_MANAGER', 'HR', 'HRBP')
  recs(@Me() u: User) {
    return this.db.byRole(u.companyId, ['RECRUITER']).then((x) => x.map(clean));
  }

  /* Step 2: job post (Free: 2 open posts · Premium: 5 + candidate pool) */
  @Post('jobs')
  @Roles('RECRUITER', 'HR_MANAGER')
  async job(
    @Me() u: User,
    @Body()
    b: {
      requisitionId: string;
      title?: string;
      description: string;
      skills?: string[];
      location?: string;
    },
  ) {
    const c = await this.db.company(u.companyId),
      plan = PLAN[c.atsPlan] || PLAN.FREE;
    const r = await this.db.approvals.findOneBy({
      id: b.requisitionId,
      companyId: u.companyId,
      type: 'REQUISITION',
    });
    if (!r || r.status !== 'APPROVED') {
      throw new BadRequestException('Approved requisition required');
    }
    if (r.payload.recruiterId !== u.id && u.role !== 'HR_MANAGER') {
      throw new ForbiddenException('Requisition is not assigned to you');
    }
    const open = await this.db.jobs.count({
      where: { companyId: u.companyId, source: 'INTERNAL', status: 'OPEN' },
    });
    if (open >= plan.jobs) {
      throw new ForbiddenException(
        `${c.atsPlan} plan allows ${plan.jobs} open job posts. ${
          c.atsPlan === 'FREE'
            ? 'Upgrade to Premium for 5 posts + candidate pool.'
            : 'Close one first.'
        }`,
      );
    }
    const j = await this.db.jobs.save(
      this.db.jobs.create({
        companyId: u.companyId,
        reqId: r.id,
        recruiterId: u.id,
        title: b.title || r.payload.title,
        description: b.description,
        skills: b.skills || r.payload.skills || [],
        location: b.location,
        source: 'INTERNAL',
        companyName: c.name,
        status: 'OPEN',
      }),
    );
    const url = `${BASE_URL()}/jobs/${j.id}`;
    return {
      job: j,
      share: {
        link: url,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          url,
        )}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(
          j.title + ' ' + url,
        )}`,
        mail: `mailto:?subject=${encodeURIComponent(
          j.title,
        )}&body=${encodeURIComponent(url)}`,
      },
    };
  }

  @Get('jobs')
  jobs(@Me() u: User) {
    return this.db.jobs.find({
      where: { companyId: u.companyId },
      order: { createdAt: 'DESC' },
    });
  }

  @Put('jobs/:id/close')
  async close(@Me() u: User, @Param('id') id: string) {
    const j = await this.db.jobs.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    j.status = 'CLOSED';
    return this.db.jobs.save(j);
  }

  @Get('jobs/:id/applications')
  async applications(@Me() u: User, @Param('id') id: string) {
    const apps = await this.db.apps.find({
      where: { jobId: id, companyId: u.companyId },
    });
    const us = await this.db.users.find({
      where: { id: In(apps.map((a) => a.candidateId).concat('-')) },
    });
    return apps.map((a) => ({
      ...a,
      candidate: clean(us.find((x) => x.id === a.candidateId)),
    }));
  }

  @Get('pool')
  async pool(@Me() u: User, @Query('q') q = '') {
    const c = await this.db.company(u.companyId);
    if (!PLAN[c.atsPlan]?.pool) {
      throw new ForbiddenException('Candidate pool is a Premium feature');
    }
    const all = await this.db.users.find({
      where: { role: 'CANDIDATE', verified: true, active: true },
    });
    return all
      .filter(
        (x) =>
          x.profilePct >= 60 &&
          x.video &&
          `${x.name} ${JSON.stringify(x.profile)}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      )
      .map((x) => ({
        id: x.id,
        name: x.name,
        headline: x.profile?.headline,
        skills: x.profile?.skills,
        experienceYears: x.profile?.experienceYears,
        videoScore: x.video?.overall,
        profilePct: x.profilePct,
      }));
  }

  @Post('applications/:id/screen')
  async screen(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { decision: 'SHORTLIST' | 'REJECT'; notes?: string },
  ) {
    const a = await this.db.apps.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    a.status = b.decision === 'SHORTLIST' ? 'SHORTLISTED' : 'REJECTED';
    a.notes = b.notes;
    a.timeline = [
      ...(a.timeline || []),
      { at: now(), status: a.status, by: u.name },
    ];
    await this.db.apps.save(a);
    await this.n.send(a.candidateId, {
      title: `Application update`,
      body: `Your application is now: ${a.status}`,
      type: 'ATS',
      link: '/candidate/applications',
    });
    return a;
  }

  /* Step 3: schedule interview inside Nerkanal Meet; link goes to candidate, recruiter & panel by mail + SMS + in-app */
  @Post('interviews')
  async schedule(
    @Me() u: User,
    @Body()
    b: {
      applicationId: string;
      startsAt: string;
      durationMin?: number;
      panelIds: string[];
      round?: string;
    },
  ) {
    const a = await this.db.apps.findOneByOrFail({
        id: b.applicationId,
        companyId: u.companyId,
      }),
      cand = await this.db.user(a.candidateId),
      j = await this.db.jobs.findOneByOrFail({ id: a.jobId });
    const m = await this.ap.meets(
      u.companyId,
      u.id,
      'INTERVIEW',
      `Interview: ${cand.name} — ${j.title}${
        b.round ? ' (' + b.round + ')' : ''
      }`,
      b.startsAt,
      b.durationMin || 45,
      [a.candidateId, ...(b.panelIds || [])],
      { applicationId: a.id, candidateId: a.candidateId, jobId: j.id },
    );
    a.status = 'INTERVIEW';
    a.timeline = [
      ...(a.timeline || []),
      { at: now(), status: 'INTERVIEW', meetingId: m.id },
    ];
    await this.db.apps.save(a);
    return m;
  }

  @Get('interviews')
  async interviews(@Me() u: User) {
    return (
      await this.db.meetings.find({
        where: { companyId: u.companyId, kind: 'INTERVIEW' },
        order: { startsAt: 'DESC' },
      })
    ).filter((m) =>
      u.role === 'RECRUITER' || HRS.includes(u.role)
        ? true
        : m.attendeeIds.includes(u.id),
    );
  }

  @Post('interviews/:id/feedback')
  async feedback(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { rating: number; comments: string; recommend: boolean },
  ) {
    const m = await this.db.meetings.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    if (!m.attendeeIds.includes(u.id)) {
      throw new ForbiddenException('You are not on this panel');
    }
    const f = await this.db.addRec('FEEDBACK', {
      companyId: u.companyId,
      ownerId: u.id,
      refId: id,
      status: 'SUBMITTED',
      data: {
        ...b,
        panelName: u.name,
        applicationId: m.ctx?.applicationId,
        candidateId: m.ctx?.candidateId,
      },
    });
    await this.n.send(m.hostId, {
      title: `Panel feedback submitted by ${u.name}`,
      type: 'ATS',
      link: `/ats/interviews/${id}`,
    });
    return f;
  }

  @Get('interviews/:id/feedback')
  @Roles('RECRUITER', 'HR_MANAGER', 'HR', 'HRBP')
  fb(@Param('id') id: string) {
    return this.db.listRec('FEEDBACK', { refId: id });
  }

  @Post('feedback/:id/publish')
  @Roles('RECRUITER', 'HR_MANAGER')
  async publish(@Param('id') id: string, @Body() b: { comments?: string }) {
    const f = await this.db.rec('FEEDBACK', id);
    f.status = 'PUBLISHED';
    f.data = {
      ...f.data,
      publishedAt: now(),
      ...(b?.comments ? { comments: b.comments } : {}),
      panelName: undefined,
    };
    await this.db.recs.save(f);
    await this.n.send(f.data.candidateId, {
      title: 'Interview feedback available',
      type: 'ATS',
      link: '/candidate/feedback',
      sms: true,
    });
    return f;
  }

  /* Step 4: documentation → verification → offer → accepted offers are pushed to HRBP */
  @Post('applications/:id/documents')
  async docs(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { docs: { name: string; url: string }[] },
  ) {
    const a = await this.db.apps.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    a.docs = [
      ...(a.docs || []),
      ...b.docs.map((d) => ({ ...d, verified: false })),
    ];
    return this.db.apps.save(a);
  }

  @Post('applications/:id/verify-docs')
  @Roles('RECRUITER', 'HR_MANAGER')
  async verifyDocs(@Me() u: User, @Param('id') id: string) {
    const a = await this.db.apps.findOneByOrFail({
      id,
      companyId: u.companyId,
    });
    if (!a.docs?.length) throw new BadRequestException('No documents');
    a.docs = a.docs.map((d) => ({ ...d, verified: true, verifiedBy: u.name }));
    return this.db.apps.save(a);
  }

  @Post('offers')
  @Roles('RECRUITER', 'HR_MANAGER')
  async offer(
    @Me() u: User,
    @Body()
    b: {
      applicationId: string;
      designation: string;
      ctc: number;
      doj: string;
      expiresOn?: string;
    },
  ) {
    const a = await this.db.apps.findOneByOrFail({
      id: b.applicationId,
      companyId: u.companyId,
    });
    if (!a.docs?.length || a.docs.some((d) => !d.verified)) {
      throw new BadRequestException(
        'Verify candidate documents before releasing the offer',
      );
    }
    const c = await this.db.company(u.companyId),
      cand = await this.db.user(a.candidateId),
      o = {
        ...b,
        expiresOn: b.expiresOn || addDays(new Date(), 7),
        recruiterId: u.id,
      };
    const rec = await this.db.addRec('OFFER', {
      companyId: u.companyId,
      ownerId: cand.id,
      refId: a.id,
      status: 'RELEASED',
      data: { ...o, html: offerHtml(c, cand, o), candidateName: cand.name },
    });
    a.status = 'OFFERED';
    await this.db.apps.save(a);
    await this.n.send(cand.id, {
      title: `Offer from ${c.name}`,
      body: `${b.designation} — respond by ${o.expiresOn}`,
      type: 'OFFER',
      link: '/candidate/offers',
      sms: true,
    });
    return rec;
  }

  @Get('offers')
  offers(@Me() u: User) {
    return this.db.listRec('OFFER', { companyId: u.companyId });
  }
}
