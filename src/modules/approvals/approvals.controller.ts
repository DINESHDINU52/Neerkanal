import {
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { Approvals } from '../core/services/approvals.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Me } from '../../common/decorators/auth.decorators';

@Ctl('approvals')
export class ApprovalsCtl {
  constructor(
    private db: Db,
    private ap: Approvals,
  ) {}

  /** Everything waiting on ME (RM → HR → Admin → Finance chain). */
  @Get('inbox')
  async inbox(@Me() u: User) {
    const pend = await this.db.approvals.find({
      where: { companyId: u.companyId, status: 'PENDING' },
      order: { createdAt: 'DESC' },
    });
    const out = [];
    for (const a of pend) {
      if (await this.ap.canAct(a, u)) out.push(await this.ap.view(a));
    }
    return out;
  }

  @Get('mine')
  async mine(@Me() u: User) {
    return Promise.all(
      (
        await this.db.approvals.find({
          where: { requesterId: u.id },
          order: { createdAt: 'DESC' },
        })
      ).map((a) => this.ap.view(a)),
    );
  }

  @Get(':id')
  async one(@Me() u: User, @Param('id') id: string) {
    const a = await this.db.approvals.findOneBy({ id });
    if (!a || (a.companyId !== u.companyId && u.role !== 'SUPER_ADMIN')) {
      throw new NotFoundException();
    }
    return this.ap.view(a);
  }

  @Post(':id/act')
  async act(
    @Me() u: User,
    @Param('id') id: string,
    @Body() b: { approve: boolean; remarks?: string },
  ) {
    return this.ap.act(id, u, !!b.approve, b.remarks);
  }
}
