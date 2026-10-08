import {
  Get,
  Post,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS } from '../../common/constants';
import { now, ym } from '../../common/utils';

export const courseSuggestions = (skill: string) => [
  {
    provider: 'Coursera (paid)',
    title: `${skill} — top-rated specialisation`,
    url: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`,
    paid: true,
  },
  {
    provider: 'LinkedIn Learning (paid)',
    title: `${skill} learning paths`,
    url: `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(
      skill,
    )}`,
    paid: true,
  },
  {
    provider: 'NPTEL (free)',
    title: `${skill} — NPTEL certification courses`,
    url: `https://nptel.ac.in/courses?search=${encodeURIComponent(skill)}`,
    paid: false,
  },
];

@Ctl('training')
@Feat('training')
export class TrainingCtl {
  constructor(
    private db: Db,
    private n: Notifier,
  ) {}

  /** RM analyses the team every 2 months and records skill gaps; one paid + one free course is suggested per gap. */
  @Post('skill-gap')
  @Roles('RM', 'HR', 'HRBP', 'HR_MANAGER')
  async gap(
    @Me() u: User,
    @Body() b: { userId: string; gaps: string[] },
  ) {
    const e = await this.db.user(b.userId);
    if (e.rmId !== u.id && !HRS.includes(u.role)) {
      throw new ForbiddenException();
    }
    const sugg = b.gaps.map((g) => ({ skill: g, courses: courseSuggestions(g) }));
    const r = await this.db.addRec('SKILLGAP', {
      companyId: e.companyId,
      ownerId: e.id,
      key: ym(),
      data: { gaps: b.gaps, suggestions: sugg, by: u.id },
    });
    await this.n.send(e.id, {
      title: 'Skill-gap review shared — pick a course',
      body: b.gaps.join(', '),
      type: 'TRAINING',
      link: `/training/skill-gap/${r.id}`,
    });
    return r;
  }

  @Get('skill-gap')
  sg(@Me() u: User) {
    return this.db.listRec(
      'SKILLGAP',
      HRS.includes(u.role) ? { companyId: u.companyId } : { ownerId: u.id },
    );
  }

  @Post('enroll')
  async enroll(
    @Me() u: User,
    @Body()
    b: {
      title: string;
      provider: string;
      url?: string;
      source?: 'SUGGESTED' | 'SELF';
    },
  ) {
    return this.db.addRec('TRAINING', {
      companyId: u.companyId,
      ownerId: u.id,
      status: 'IN_PROGRESS',
      data: { ...b, source: b.source || 'SELF', startedAt: now() },
    });
  }

  @Post(':id/certificate')
  async cert(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { certificateUrl: string; testScore?: number },
  ) {
    const t = await this.db.rec('TRAINING', id);
    if (t.ownerId !== u.id) throw new ForbiddenException();
    t.status = 'COMPLETED';
    t.data = { ...t.data, ...b, completedAt: now() };
    await this.db.recs.save(t);
    await this.n.send(
      [u.rmId, ...(await this.db.ids(u.companyId, HRS))].filter(Boolean),
      {
        title: `${u.name} completed "${t.data.title}"`,
        type: 'TRAINING',
      },
    );
    return t;
  }

  @Get('mine')
  mine(@Me() u: User) {
    return this.db.listRec('TRAINING', { ownerId: u.id });
  }

  @Get('all')
  @Roles('HR', 'HRBP', 'HR_MANAGER', 'RM')
  all(@Me() u: User) {
    return this.db.listRec('TRAINING', { companyId: u.companyId });
  }

  /** Training calendar (POSH etc.). HR is auto-notified 7 days before by cron. */
  @Post('calendar')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async cal(
    @Me() u: User,
    @Body()
    b: {
      title: string;
      date: string;
      mandatory?: boolean;
      audience?: string;
    },
  ) {
    const r = await this.db.addRec('TRAINING_CAL', {
      companyId: u.companyId,
      key: b.date,
      status: 'SCHEDULED',
      data: b,
    });
    await this.n.send(await this.db.ids(u.companyId, ['EMPLOYEE', 'RM']), {
      title: `Training scheduled: ${b.title}`,
      body: b.date,
      type: 'TRAINING',
    });
    return r;
  }

  @Get('calendar')
  calendar(@Me() u: User) {
    return this.db.listRec('TRAINING_CAL', { companyId: u.companyId });
  }

  /** Anonymous suggestion to another team → becomes that department's brainstorm topic. */
  @Post('suggestions')
  async suggest(@Me() u: User, @Body() b: { team: string; text: string }) {
    return this.db.addRec('IDEA', {
      companyId: u.companyId,
      key: b.team,
      status: 'OPEN',
      data: { text: b.text, anonymous: true },
    });
  }

  @Get('suggestions')
  @Roles('RM', 'DEPT_HEAD', 'HR', 'HRBP', 'HR_MANAGER')
  async sug(@Me() u: User, @Query('team') team?: string) {
    return (
      await this.db.listRec('IDEA', {
        companyId: u.companyId,
        ...(team ? { key: team } : {}),
      })
    ).map((r) => ({
      id: r.id,
      team: r.key,
      text: r.data.text,
      at: r.createdAt,
    }));
  }

  @Post('brainstorm')
  @Roles('RM', 'DEPT_HEAD')
  async bs(@Me() u: User, @Body() b: { topic: string }) {
    const r = await this.db.addRec('BRAINSTORM', {
      companyId: u.companyId,
      ownerId: u.id,
      status: 'OPEN',
      data: { topic: b.topic, ideas: [] },
    });
    await this.n.send((await this.db.teamOf(u.id)).map((x) => x.id), {
      title: `Brainstorm: ${b.topic}`,
      body: 'Share your ideas',
      type: 'TRAINING',
      link: `/training/brainstorm/${r.id}`,
    });
    return r;
  }

  @Get('brainstorm')
  async bsList(@Me() u: User) {
    return (
      await this.db.listRec('BRAINSTORM', { companyId: u.companyId })
    ).filter(
      (b) =>
        b.ownerId === u.id ||
        u.rmId === b.ownerId ||
        HRS.includes(u.role),
    );
  }

  @Post('brainstorm/:id/ideas')
  async idea(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { text: string },
  ) {
    const r = await this.db.rec('BRAINSTORM', id);
    r.data = {
      ...r.data,
      ideas: [...r.data.ideas, { by: u.name, text: b.text, at: now() }],
    };
    await this.db.recs.save(r);
    await this.n.send(r.ownerId, {
      title: `New idea on "${r.data.topic}"`,
      type: 'TRAINING',
    });
    return r;
  }
}
