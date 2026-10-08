import {
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Roles, Feat, Me } from '../../common/decorators/auth.decorators';
import { HRS } from '../../common/constants';
import { now } from '../../common/utils';

@Ctl('handbook')
@Feat('handbook')
export class HandbookCtl {
  constructor(
    private db: Db,
    private n: Notifier,
  ) {}

  @Post('policies')
  @Roles('HR', 'HRBP', 'HR_MANAGER', 'ADMIN')
  async add(
    @Me() u: User,
    @Body()
    b: {
      title: string;
      body: string;
      version?: string;
      publish?: boolean;
    },
  ) {
    const p = await this.db.addRec('POLICY', {
      companyId: u.companyId,
      ownerId: u.id,
      status: b.publish === false ? 'DRAFT' : 'PUBLISHED',
      data: {
        title: b.title,
        body: b.body,
        version: b.version || '1.0',
      },
    });
    if (p.status === 'PUBLISHED') {
      await this.n.send(
        await this.db.ids(u.companyId, [
          'EMPLOYEE',
          'RM',
          'DEPT_HEAD',
          'RECRUITER',
          'PANEL',
          'FINANCE',
          ...HRS,
        ]),
        {
          title: `New policy: ${b.title}`,
          body: 'Please read and sign to acknowledge',
          type: 'POLICY',
          link: `/handbook/policies/${p.id}`,
          sms: true,
        },
      );
    }
    return p;
  }

  @Post('policies/:id/publish')
  @Roles('HR', 'HRBP', 'HR_MANAGER')
  async pub(@Me() u: User, @Param('id') id: string) {
    const p = await this.db.rec('POLICY', id);
    p.status = 'PUBLISHED';
    await this.db.recs.save(p);
    await this.n.send(
      await this.db.ids(u.companyId, [
        'EMPLOYEE',
        'RM',
        'DEPT_HEAD',
        'RECRUITER',
        'FINANCE',
        ...HRS,
      ]),
      {
        title: `New policy: ${p.data.title}`,
        type: 'POLICY',
        sms: true,
      },
    );
    return p;
  }

  @Get('policies')
  async list(@Me() u: User) {
    const ps = await this.db.listRec('POLICY', {
        companyId: u.companyId,
      }),
      acks = await this.db.listRec('ACK', { ownerId: u.id });
    return ps
      .filter((p) => p.status === 'PUBLISHED' || HRS.includes(u.role))
      .map((p) => ({
        id: p.id,
        status: p.status,
        ...p.data,
        acknowledged: acks.some((a) => a.refId === p.id),
      }));
  }

  @Post('policies/:id/ack')
  async ack(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { signature: string },
  ) {
    const p = await this.db.rec('POLICY', id);
    if (!b.signature) {
      throw new BadRequestException('Digital signature required');
    }
    if (
      (
        await this.db.listRec('ACK', { ownerId: u.id, refId: id })
      ).length
    ) {
      return { already: true };
    }
    return this.db.addRec('ACK', {
      companyId: u.companyId,
      ownerId: u.id,
      refId: id,
      data: {
        signature: b.signature,
        version: p.data.version,
        at: now(),
        name: u.name,
        empId: u.empId,
      },
    });
  }

  @Get('policies/:id/status')
  @Roles('HR', 'HRBP', 'HR_MANAGER', 'ADMIN')
  async status(@Me() u: User, @Param('id') id: string) {
    const acks = await this.db.listRec('ACK', { refId: id }),
      emps = await this.db.employees(u.companyId);
    return {
      acknowledged: acks.length,
      total: emps.length,
      pending: emps
        .filter((e) => !acks.some((a) => a.ownerId === e.id))
        .map((e) => ({ id: e.id, name: e.name, empId: e.empId })),
    };
  }
}
