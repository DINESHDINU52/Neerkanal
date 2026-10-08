import {
  Get,
  Post,
  Body,
  Param,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS, ADMINS } from '../../common/constants';
import { now, ymd, addDays } from '../../common/utils';

@Ctl('exit')
@Feat('exit')
export class ExitCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
    private n: Notifier,
  ) {}

  @Post('resign')
  async resign(
    @Me() u: User,
    @Body() b: { reason: string; lwd?: string },
  ) {
    return this.ap.create('RESIGNATION', u, b, ['RM'], `Resignation — ${u.name}`);
  }

  @Get()
  @Roles('HR', 'HRBP', 'HR_MANAGER', 'RM', 'ADMIN')
  async list(@Me() u: User) {
    return this.db.listRec('EXIT', { companyId: u.companyId });
  }

  @Get('mine')
  mine(@Me() u: User) {
    return this.db.listRec('EXIT', { ownerId: u.id });
  }

  /** HRBP sets notice period / last working day. */
  @Post(':id/notice')
  @Roles('HRBP', 'HR', 'HR_MANAGER')
  async notice(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { noticeDays?: number; lwd?: string },
  ) {
    const x = await this.db.rec('EXIT', id),
      lwd = b.lwd || addDays(ymd(), b.noticeDays || 30);
    x.data = { ...x.data, lwd, noticeDays: b.noticeDays };
    await this.db.recs.save(x);
    await this.n.send(x.ownerId, {
      title: `Your last working day is ${lwd}`,
      type: 'EXIT',
      sms: true,
    });
    return x;
  }

  /** Clearance: Knowledge Transfer = RM · Asset = HR · Access removal = Admin. */
  @Post(':id/clear')
  async clear(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { item: 'KT' | 'ASSET' | 'ACCESS'; note?: string },
  ) {
    const x = await this.db.rec('EXIT', id),
      e = await this.db.user(x.ownerId),
      allowed =
        b.item === 'KT'
          ? e.rmId === u.id || u.role === 'SUPER_ADMIN'
          : b.item === 'ASSET'
          ? HRS.includes(u.role)
          : ADMINS.includes(u.role);
    if (!allowed) {
      throw new ForbiddenException(
        `${b.item} clearance is done by ${
          b.item === 'KT'
            ? 'the reporting manager'
            : b.item === 'ASSET'
            ? 'HR'
            : 'Admin'
        }`,
      );
    }
    x.data = {
      ...x.data,
      clearances: {
        ...x.data.clearances,
        [b.item]: { by: u.name, at: now(), note: b.note },
      },
    };
    await this.db.recs.save(x);
    return x;
  }

  @Post(':id/close')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async close(@Me() u: User, @Param('id') id: string) {
    const x = await this.db.rec('EXIT', id),
      cl = x.data.clearances,
      e = await this.db.user(x.ownerId),
      c = await this.db.company(e.companyId);
    if (!cl.KT || !cl.ASSET || !cl.ACCESS) {
      throw new BadRequestException(
        'KT, Asset and Access clearances are all required',
      );
    }
    const lwd = x.data.lwd || ymd(),
      tpl = (t: string) =>
        `<div style="font-family:Arial;max-width:720px;margin:auto"><h2 style="color:#0B1F4B">${
          c.name
        }</h2><h3>${t}</h3><p>This is to certify that <b>${e.name}</b> (Emp ID ${
          e.empId
        }) served as <b>${e.designation}</b> from ${e.doj} to ${lwd}. ${
          t.startsWith('Relieving')
            ? 'The employee is relieved of all duties with effect from the above date.'
            : 'Conduct and performance were found satisfactory.'
        }</p><p>HR, ${c.name}</p></div>`;
    x.data = {
      ...x.data,
      letters: {
        experience: tpl('Experience Certificate'),
        relieving: tpl('Relieving Letter'),
      },
    };
    x.status = 'CLOSED';
    await this.db.recs.save(x);
    e.active = false;
    e.probationState = 'EXITED';
    await this.db.users.save(e); // candidature closed — login disabled
    return { status: 'CLOSED', letters: x.data.letters };
  }
}
