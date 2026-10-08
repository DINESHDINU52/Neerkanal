import {
  Get,
  Post,
  Param,
  Query,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { ExternalJobs } from '../core/services/external-jobs.service';
import { Notifier } from '../core/services/notifier.service';
import { User, Job } from '../../database/entities';
import { Ctl, Roles, Me } from '../../common/decorators/auth.decorators';
import { now } from '../../common/utils';

@Ctl('jobs')
export class JobsCtl {
  constructor(
    private db: Db,
    private ext: ExternalJobs,
    private n: Notifier,
  ) {}

  private gate(u: User) {
    if (
      u.role === 'CANDIDATE' &&
      (u.profilePct < 60 || !u.video)
    ) {
      throw new ForbiddenException(
        'Complete ≥60% profile and your video self-intro to search & apply for jobs',
      );
    }
  }

  @Get('search')
  @Roles('CANDIDATE')
  async search(
    @Me() u: User,
    @Query('q') q = '',
    @Query('skills') skills = '',
  ) {
    this.gate(u);
    const ql = q.toLowerCase(),
      sk = skills
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const match = (j: Job) =>
      (!ql ||
        `${j.title} ${j.description} ${(j.skills || []).join(' ')}`
          .toLowerCase()
          .includes(ql)) &&
      sk.every((s) =>
        `${j.title} ${j.description} ${(j.skills || []).join(' ')}`
          .toLowerCase()
          .includes(s),
      );
    await this.ext.search(q || sk[0] || '');
    const all = await this.db.jobs.find({
      where: { status: 'OPEN' },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const internal = all.filter((j) => j.source === 'INTERNAL' && match(j)),
      external = all
        .filter((j) => j.source === 'EXTERNAL' && match(j))
        .slice(0, 40);
    return { internal, external, results: [...internal, ...external] }; // recruiter-posted jobs always first
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.db.jobs.findOneByOrFail({ id });
  }

  @Post(':id/apply')
  @Roles('CANDIDATE')
  async apply(@Me() u: User, @Param('id') id: string) {
    this.gate(u);
    const j = await this.db.jobs.findOneBy({ id });
    if (!j || j.status !== 'OPEN') throw new NotFoundException('Job not available');
    if (j.source === 'EXTERNAL') {
      await this.db.addRec('EXT_CLICK', {
        ownerId: u.id,
        refId: j.id,
        data: { url: j.applyUrl },
      });
      return { redirect: j.applyUrl };
    }
    if (await this.db.apps.findOneBy({ jobId: id, candidateId: u.id })) {
      throw new ConflictException('Already applied');
    }
    const a = await this.db.apps.save(
      this.db.apps.create({
        companyId: j.companyId,
        jobId: id,
        candidateId: u.id,
        status: 'APPLIED',
        timeline: [{ at: now(), status: 'APPLIED' }],
        docs: [],
      }),
    );
    await this.n.send(j.recruiterId, {
      title: `New application: ${j.title}`,
      body: `${u.name} (profile ${u.profilePct}%, video ${u.video?.overall}/100)`,
      type: 'ATS',
      link: `/ats/jobs/${id}`,
    });
    return a;
  }
}
