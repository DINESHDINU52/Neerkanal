import {
  Get,
  Post,
  Param,
  Query,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Me } from '../../common/decorators/auth.decorators';

@Ctl('notifications')
export class NotificationsCtl {
  constructor(private db: Db) {}

  @Get()
  list(@Me() u: User, @Query('unread') unread?: string) {
    return this.db.notes.find({
      where: { userId: u.id, ...(unread ? { read: false } : {}) },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Post('read-all')
  async readAll(@Me() u: User) {
    await this.db.notes.update({ userId: u.id }, { read: true });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@Me() u: User, @Param('id') id: string) {
    await this.db.notes.update({ id, userId: u.id }, { read: true });
    return { ok: true };
  }
}
