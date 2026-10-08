import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Db } from '../../database/database.service';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private ref: Reflector,
    private jwt: JwtService,
    private db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const get = (k: string) =>
      this.ref.getAllAndOverride<any>(k, [ctx.getHandler(), ctx.getClass()]);
    if (get('public')) return true;

    const req = ctx.switchToHttp().getRequest();
    const tok =
      (req.headers.authorization || '').replace(/^Bearer /i, '') ||
      req.query?.token;
    if (!tok) throw new UnauthorizedException('Login required');

    let payload: any;
    try {
      payload = this.jwt.verify(tok);
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const u = await this.db.users.findOneBy({ id: payload.sub });
    if (!u || !u.active) throw new UnauthorizedException('Account inactive');
    req.user = u;

    const roles: string[] = get('roles');
    if (
      roles?.length &&
      !roles.includes(u.role) &&
      u.role !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(`Requires role: ${roles.join(' / ')}`);
    }

    const feat: string = get('feature');
    if (feat && u.companyId) {
      const c = await this.db.company(u.companyId);
      if (!(c.modules || []).includes(feat)) {
        throw new ForbiddenException(
          `Module "${feat}" is not purchased by your organisation. Ask your admin to subscribe (Settings → Plans).`,
        );
      }
    }

    return true;
  }
}
