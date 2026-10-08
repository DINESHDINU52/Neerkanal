import {
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { User } from '../../database/entities/user.entity';
import { Ctl, Me } from '../../common/decorators/auth.decorators';
import { Jarvis } from './jarvis.service';

@Ctl('jarvis')
export class JarvisCtl {
  constructor(private j: Jarvis) {}

  @Post('chat')
  chat(
    @Me() u: User,
    @Body() b: { message: string; history?: any[] },
  ) {
    if (!b.message) throw new BadRequestException('message required');
    return this.j.chat(u, b.message, b.history || []);
  }
}
