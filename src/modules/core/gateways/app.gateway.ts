import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Db } from '../../../database/database.service';
import { Live } from '../services/notifier.service';
import { now } from '../../../common/utils';

/* WebSocket gateway: live notifications + WebRTC signalling for the built-in "Nerkanal Meet" */
@WebSocketGateway({ cors: { origin: '*' } })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private db: Db,
  ) {}

  afterInit(s: Server) {
    Live.io = s;
  }

  handleConnection(c: Socket) {
    try {
      const p: any = this.jwt.verify(
        (c.handshake.auth?.token || c.handshake.query?.token) as string,
      );
      (c as any).uid = p.sub;
      c.join(`user:${p.sub}`);
    } catch {
      c.disconnect(true);
    }
  }

  async handleDisconnect(c: Socket) {
    const r = (c as any).room;
    if (r) c.to(r).emit('peer-left', { id: c.id });
  }

  @SubscribeMessage('join')
  async join(c: Socket, d: { roomId: string; name: string }) {
    const m = await this.db.meetings.findOneBy({ roomId: d.roomId });
    if (!m || !m.attendeeIds.includes((c as any).uid)) {
      return c.emit('denied', 'You are not invited to this meeting');
    }
    const room = `room:${d.roomId}`;
    (c as any).room = room;
    const peers = [
      ...(this.server.sockets.adapter.rooms.get(room) || []),
    ].map((id) => ({
      id,
      name: (this.server.sockets.sockets.get(id) as any)?.dname,
    }));
    (c as any).dname = d.name;
    c.join(room);
    c.emit('peers', peers);
    c.to(room).emit('peer-joined', { id: c.id, name: d.name });
    if (m.status === 'SCHEDULED') {
      m.status = 'LIVE';
      await this.db.meetings.save(m);
    }
  }

  @SubscribeMessage('signal')
  signal(c: Socket, d: { to: string; data: any }) {
    this.server.to(d.to).emit('signal', { from: c.id, data: d.data });
  }

  @SubscribeMessage('chat')
  chat(c: Socket, d: { text: string }) {
    const r = (c as any).room;
    if (r) {
      this.server
        .to(r)
        .emit('chat', { from: (c as any).dname, text: d.text, at: now() });
    }
  }
}
