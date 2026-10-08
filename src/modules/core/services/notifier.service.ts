import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Server } from 'socket.io';
import { Db } from '../../../database/database.service';
import { ENV } from '../../../common/utils/crypto.utils';

export const BASE_URL = () => ENV('BASE_URL', 'http://localhost:3000');
const log = new Logger('Notifier');

/** Live socket.io server holder (set by the gateway). */
export const Live: { io?: Server } = {};

@Injectable()
export class Notifier {
  private tx = nodemailer.createTransport(
    ENV('SMTP_URL') || ({ jsonTransport: true } as any),
  );

  constructor(private db: Db) {}

  /** In-app + live push + email (+SMS if Twilio configured). Use `dedupe` to make cron triggers idempotent. */
  async send(
    to: string | string[],
    n: {
      title: string;
      body?: string;
      type?: string;
      link?: string;
      dedupe?: string;
      email?: boolean;
      sms?: boolean;
    },
  ) {
    const ids = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
    for (const userId of ids) {
      try {
        if (
          n.dedupe &&
          (await this.db.notes.findOneBy({ userId, dedupe: n.dedupe }))
        ) {
          continue;
        }
        const row = await this.db.notes.save(
          this.db.notes.create({
            userId,
            title: n.title,
            body: n.body || '',
            type: n.type || 'INFO',
            link: n.link,
            dedupe: n.dedupe,
            read: false,
          }),
        );
        Live.io?.to(`user:${userId}`).emit('notify', row);
        const u = await this.db.users.findOneBy({ id: userId });
        if (u && n.email !== false) {
          this.tx
            .sendMail({
              from: ENV('MAIL_FROM', 'Nerkanal <no-reply@nerkanal.app>'),
              to: u.email,
              subject: n.title,
              text: `${n.body || ''}\n${n.link ? BASE_URL() + n.link : ''}`,
            })
            .then(
              () =>
                !ENV('SMTP_URL') &&
                log.debug(`MAIL → ${u.email}: ${n.title}`),
            )
            .catch((e) => log.warn('mail failed ' + e.message));
        }
        if (u?.phone && n.sms) {
          this.sms(u.phone, `${n.title} ${n.body || ''}`.slice(0, 300));
        }
      } catch (e: any) {
        log.warn('notify failed: ' + e.message);
      }
    }
  }

  async sms(to: string, body: string) {
    const sid = ENV('TWILIO_SID'),
      tok = ENV('TWILIO_TOKEN'),
      from = ENV('TWILIO_FROM');
    if (!sid) return log.debug(`SMS → ${to}: ${body}`);
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      },
    ).catch((e: any) => log.warn('sms failed ' + e.message));
  }
}
