import {
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Db } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { User, Rec } from '../../database/entities';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS } from '../../common/constants';
import { ENV, rid, enc, dec, now } from '../../common/utils';

export const strip = (r: Rec) => {
  const { notifyEnc, ...d } = r.data;
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    ...d,
    ...(d.anonymous ? {} : { raisedBy: r.ownerId }),
  };
};

@Ctl('complaints')
@Feat('complaints')
export class ComplaintsCtl {
  constructor(
    private db: Db,
    private n: Notifier,
  ) {}

  private key(u: User) {
    return crypto
      .createHmac('sha256', ENV('JWT_SECRET', 'nerkanal-dev-secret'))
      .update(u.id)
      .digest('hex');
  }

  /** Anonymous: HR never sees the author. The reporter key is a keyed hash; the notify target is encrypted server-side only. */
  @Post()
  async raise(
    @Me() u: User,
    @Body()
    b: {
      subject: string;
      body: string;
      category?: string;
      anonymous?: boolean;
    },
  ) {
    const code = 'CMP-' + rid(6).toUpperCase(),
      anon = b.anonymous !== false;
    const r = await this.db.addRec('COMPLAINT', {
      companyId: u.companyId,
      ownerId: anon ? null : u.id,
      key: this.key(u),
      status: 'OPEN',
      data: {
        code,
        subject: b.subject,
        body: b.body,
        category: b.category,
        anonymous: anon,
        notifyEnc: enc(u.id),
        timeline: [{ at: now(), status: 'OPEN', note: 'Complaint received' }],
      },
    });
    await this.n.send(await this.db.ids(u.companyId, HRS), {
      title: `New complaint ${code}: ${b.subject}`,
      type: 'COMPLAINT',
      link: `/complaints/${r.id}`,
    });
    return { id: r.id, trackingCode: code, status: 'OPEN' };
  }

  @Get('mine')
  async mine(@Me() u: User) {
    return (
      await this.db.listRec('COMPLAINT', {
        companyId: u.companyId,
        key: this.key(u),
      })
    ).map(strip);
  }

  @Get()
  @Roles('HR', 'HRBP', 'HR_MANAGER', 'ADMIN')
  async all(@Me() u: User, @Query('status') s?: string) {
    return (
      await this.db.listRec('COMPLAINT', {
        companyId: u.companyId,
        ...(s ? { status: s } : {}),
      })
    ).map(strip);
  }

  @Post(':id/update')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async upd(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { status: string; note: string; meetingMinutesUrl?: string },
  ) {
    const r = await this.db.rec('COMPLAINT', id);
    r.status = b.status;
    r.data = {
      ...r.data,
      timeline: [
        ...r.data.timeline,
        {
          at: now(),
          status: b.status,
          note: b.note,
          minutesUrl: b.meetingMinutesUrl,
          by: 'HR',
        },
      ],
    };
    await this.db.recs.save(r);
    await this.n.send(dec(r.data.notifyEnc), {
      title: `Complaint ${r.data.code}: ${b.status}`,
      body: b.note,
      type: 'COMPLAINT',
    });
    return strip(r);
  }
}
