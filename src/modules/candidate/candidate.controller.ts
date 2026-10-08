import {
  Get,
  Put,
  Post,
  Body,
  Param,
  ForbiddenException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { In } from 'typeorm';
import { Db, clean } from '../../database/database.service';
import { VideoAI, upload, llm } from '../core/services/video-ai.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Me } from '../../common/decorators/auth.decorators';
import { PROFILE_FIELDS, QBANK } from '../../common/constants';
import {
  now,
  addMonths,
  horoscope,
  zodiac,
} from '../../common/utils';
import { candPct } from './candidate.utils';

@Ctl('candidate')
@Roles('CANDIDATE')
export class CandidateCtl {
  constructor(
    private db: Db,
    private ai: VideoAI,
    private ap: Approvals,
    private n: Notifier,
  ) {}

  @Get('dashboard')
  async dash(@Me() u: User) {
    const apps = await this.db.apps.find({ where: { candidateId: u.id } });
    const meets = (
      await this.db.meetings.find({ where: { kind: 'INTERVIEW' } })
    ).filter((m) => m.attendeeIds.includes(u.id) && m.status !== 'DONE');
    return {
      profilePct: u.profilePct,
      canApply: u.profilePct >= 60 && !!u.video,
      video: u.video,
      videoAttemptsLeft: Math.max(0, 5 - (u.videoAttempts || 0)),
      applied: apps.length,
      upcomingInterviews: meets.length,
      horoscope: u.zodiac ? horoscope(u.zodiac) : null,
      nextSteps: [
        u.profilePct < 60 && 'Complete at least 60% of your profile',
        !u.video && 'Record your video self-intro',
        'Search & apply for jobs',
      ].filter(Boolean),
    };
  }

  @Get('profile')
  profile(@Me() u: User) {
    return clean(u);
  }

  @Put('profile')
  async put(@Me() u: User, @Body() b: any) {
    const { name, phone, dob, zodiac: z, ...rest } = b;
    if (name) u.name = name;
    if (phone) u.phone = phone;
    if (dob) {
      u.dob = dob;
      u.zodiac = z || zodiac(dob);
    } else if (z) {
      u.zodiac = z;
    }
    u.profile = {
      ...(u.profile || {}),
      ...Object.fromEntries(
        Object.entries(rest).filter(([k]) => PROFILE_FIELDS.includes(k)),
      ),
    };
    u.profilePct = candPct(u);
    await this.db.users.save(u);
    return {
      profilePct: u.profilePct,
      canApply: u.profilePct >= 60,
      user: clean(u),
    };
  }

  /** Video self-intro: max 5 attempts; once finalised the score is frozen for 3 months. */
  @Post('video')
  @UseInterceptors(upload)
  async video(@Me() u: User, @UploadedFile() f: any) {
    if (u.profilePct < 60) {
      throw new ForbiddenException('Complete 60% of your profile first');
    }
    if (!f) {
      throw new BadRequestException('Attach the video as multipart field "file"');
    }
    if (u.videoLockUntil && new Date(u.videoLockUntil) > new Date()) {
      throw new ForbiddenException(
        `Your score is locked until ${u.videoLockUntil.slice(0, 10)}`,
      );
    }
    if (u.videoLockUntil) {
      u.videoAttempts = 0;
      u.videoLockUntil = null;
    }
    if (u.videoAttempts >= 5) {
      throw new ForbiddenException('All 5 attempts used');
    }
    const r = await this.ai.analyze(f.path, f.size);
    u.videoAttempts += 1;
    await this.db.addRec('VIDEO', {
      ownerId: u.id,
      status: r.faceVerified ? 'VERIFIED' : 'FACE_NOT_DETECTED',
      data: { ...r, url: `/files/${f.filename}`, attempt: u.videoAttempts },
    });
    if (r.faceVerified) {
      u.video = { ...r, url: `/files/${f.filename}`, recordedAt: now() };
    }
    if (u.videoAttempts >= 5 && u.video) {
      u.videoLockUntil = addMonths(new Date(), 3);
    }
    await this.db.users.save(u);
    return {
      attempt: u.videoAttempts,
      attemptsLeft: 5 - u.videoAttempts,
      result: r,
      accepted: r.faceVerified,
      message: r.faceVerified
        ? 'Face verified & scored. Finalise to lock your score for 3 months, or retake.'
        : 'Face not detected — please retake in good light, facing the camera.',
    };
  }

  @Post('video/finalize')
  async finalize(@Me() u: User) {
    if (!u.video) throw new BadRequestException('Record a verified video first');
    u.videoLockUntil = addMonths(new Date(), 3);
    await this.db.users.save(u);
    return { locked: true, until: u.videoLockUntil, score: u.video };
  }

  @Get('applications')
  async apps(@Me() u: User) {
    const apps = await this.db.apps.find({
      where: { candidateId: u.id },
      order: { createdAt: 'DESC' },
    });
    const jobs = await this.db.jobs.find({
      where: { id: In(apps.map((a) => a.jobId).concat('-')) },
    });
    return apps.map((a) => ({
      ...a,
      job: jobs.find((j) => j.id === a.jobId),
    }));
  }

  @Get('interviews')
  async interviews(@Me() u: User) {
    return (
      await this.db.meetings.find({
        where: { kind: 'INTERVIEW' },
        order: { startsAt: 'ASC' },
      })
    ).filter((m) => m.attendeeIds.includes(u.id));
  }

  @Get('feedback')
  async feedback(@Me() u: User) {
    return (
      await this.db.listRec('FEEDBACK', { status: 'PUBLISHED' })
    )
      .filter((f) => f.data.candidateId === u.id)
      .map((f) => ({
        meetingId: f.refId,
        rating: f.data.rating,
        comments: f.data.comments,
        publishedAt: f.data.publishedAt,
      }));
  }

  @Get('offers')
  offers(@Me() u: User) {
    return this.db.listRec('OFFER', { ownerId: u.id });
  }

  @Post('offers/:id/respond')
  async respond(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { accept: boolean; reason?: string },
  ) {
    const o = await this.db.rec('OFFER', id);
    if (o.ownerId !== u.id) throw new ForbiddenException();
    if (o.status !== 'RELEASED') {
      throw new BadRequestException(`Offer already ${o.status}`);
    }
    o.status = b.accept ? 'ACCEPTED' : 'DECLINED';
    o.data = { ...o.data, respondedAt: now(), reason: b.reason };
    const app = await this.db.apps.findOneBy({ id: o.refId });
    if (app) {
      app.status = b.accept ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED';
      await this.db.apps.save(app);
    }
    if (b.accept) {
      o.status = 'PUSHED_TO_HRBP';
    }
    await this.db.recs.save(o);
    const hr = await this.db.ids(
      o.companyId,
      b.accept ? ['HRBP', 'HR_MANAGER'] : ['RECRUITER'],
    );
    await this.n.send([...hr, o.data.recruiterId].filter(Boolean), {
      title: `Offer ${b.accept ? 'accepted' : 'declined'}: ${u.name}`,
      body: b.accept ? 'Candidate pushed to HRBP for onboarding' : b.reason,
      type: 'OFFER',
      link: `/onboarding`,
      sms: true,
    });
    return { status: o.status };
  }

  /** Mock interview with Jarvis — generic questions; feedback with improvement points. */
  @Post('mock-interview/start')
  async mockStart(@Me() u: User, @Body() b: { role?: string }) {
    let qs = QBANK.slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);
    const g = await llm(
      'Return ONLY a JSON array of 5 concise, commonly asked interview questions.',
      `Role: ${b?.role || u.profile?.headline || 'general'}`,
      400,
    ).catch(() => null);
    try {
      const j = JSON.parse((g || '').replace(/```json|```/g, ''));
      if (Array.isArray(j) && j.length) qs = j.slice(0, 5);
    } catch {
      /* keep bank */
    }
    const m = await this.db.addRec('MOCK', {
      ownerId: u.id,
      status: 'STARTED',
      data: { role: b?.role, questions: qs },
    });
    return { mockId: m.id, questions: qs };
  }

  @Post('mock-interview/:id/submit')
  async mockSubmit(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { answers: string[] },
  ) {
    const m = await this.db.rec('MOCK', id);
    if (m.ownerId !== u.id) throw new ForbiddenException();
    const qs: string[] = m.data.questions,
      ans = b.answers || [];
    let fb: any = null;
    const t = await llm(
      'You are an interview coach. Return ONLY JSON: {"score":0-100,"perQuestion":[{"q":"","feedback":"","improve":""}],"topImprovements":["",""]}.',
      JSON.stringify(qs.map((q, i) => ({ q, a: ans[i] || '' }))),
      1200,
    ).catch(() => null);
    try {
      fb = JSON.parse((t || '').replace(/```json|```/g, ''));
    } catch {
      /* fallback below */
    }
    if (!fb) {
      const per = qs.map((q, i) => {
        const a = (ans[i] || '').trim(),
          w = a.split(/\s+/).filter(Boolean).length;
        const tips = [];
        if (w < 30) tips.push('Give a fuller answer (aim for 40–120 words).');
        if (w > 180) tips.push('Be more concise.');
        if (!/\d/.test(a)) tips.push('Add measurable results or numbers.');
        if (!/(i |my |we )/i.test(a)) {
          tips.push('Use specific personal examples (STAR method).');
        }
        return {
          q,
          feedback: tips.length ? 'Needs work' : 'Good structure',
          improve: tips.join(' ') || 'Keep it up.',
          pts: Math.max(0, 100 - tips.length * 22),
        };
      });
      fb = {
        score: Math.round(
          per.reduce((s, x) => s + x.pts, 0) / per.length,
        ),
        perQuestion: per,
        topImprovements: [
          ...new Set(
            per
              .flatMap((x) => x.improve.split('. '))
              .filter((x) => x && x !== 'Keep it up.'),
          ),
        ].slice(0, 3),
      };
    }
    m.status = 'DONE';
    m.data = { ...m.data, answers: ans, feedback: fb };
    await this.db.recs.save(m);
    return fb;
  }
}
