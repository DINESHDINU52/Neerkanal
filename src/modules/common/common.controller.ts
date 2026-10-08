import {
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Db } from '../../database/database.service';
import { upload } from '../core/services/video-ai.service';
import { User } from '../../database/entities/user.entity';
import { Ctl, Me } from '../../common/decorators/auth.decorators';

@Ctl('common')
export class CommonCtl {
  constructor(private db: Db) {}

  @Post('files')
  @UseInterceptors(upload)
  file(@UploadedFile() f: any) {
    if (!f) throw new BadRequestException('multipart field "file" required');
    return { url: `/files/${f.filename}`, name: f.originalname, size: f.size };
  }

  @Get('calendar')
  async cal(@Me() u: User) {
    return (
      await this.db.meetings.find({
        where: { companyId: u.companyId },
        order: { startsAt: 'ASC' },
      })
    )
      .filter((m) => m.attendeeIds.includes(u.id) && m.status !== 'DONE')
      .map((m) => ({
        id: m.id,
        title: m.title,
        kind: m.kind,
        startsAt: m.startsAt,
        durationMin: m.durationMin,
        link: m.link,
      }));
  }

  @Get('team')
  async team(@Me() u: User) {
    return (
      await this.db.users.find({
        where: { companyId: u.companyId, active: true },
      })
    ).map((x) => ({
      id: x.id,
      name: x.name,
      role: x.role,
      empId: x.empId,
      department: x.department,
    }));
  }
}
