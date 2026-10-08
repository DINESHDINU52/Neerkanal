import {
  Post,
  Get,
  Body,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Db, clean } from '../../database/database.service';
import { Notifier } from '../core/services/notifier.service';
import { User } from '../../database/entities/user.entity';
import { Public, Me, Ctl } from '../../common/decorators/auth.decorators';
import { MODULE_KEYS } from '../../common/constants';
import { ENV, sha, rid, zodiac } from '../../common/utils';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { candPct } from '../candidate/candidate.utils';

@Ctl('auth')
export class AuthCtl {
  constructor(
    private db: Db,
    private jwt: JwtService,
    private n: Notifier,
  ) {}

  private async otp(u: User) {
    const code = String(crypto.randomInt(100000, 999999));
    u.otp = sha(code + u.email);
    u.otpExp = new Date(Date.now() + 10 * 60e3).toISOString();
    await this.db.users.save(u);
    await this.n.send(u.id, {
      title: 'Your Nerkanal verification code',
      body: `Code: ${code} (valid 10 minutes)`,
      type: 'AUTH',
    });
    return ENV('NODE_ENV') === 'production' ? undefined : code;
  }

  private token(u: User) {
    return this.jwt.sign({ sub: u.id, role: u.role, companyId: u.companyId });
  }

  @Public()
  @Post('register')
  async register(@Body() b: RegisterDto) {
    if (await this.db.users.findOneBy({ email: b.email.toLowerCase() })) {
      throw new ConflictException('Email already registered');
    }
    const sign = b.zodiac || zodiac(b.dob || '');
    const u = await this.db.users.save(
      this.db.users.create({
        email: b.email.toLowerCase(),
        passwordHash: await bcrypt.hash(b.password, 10),
        name: b.name,
        dob: b.dob,
        phone: b.phone,
        zodiac: sign,
        role: 'CANDIDATE',
        kind: 'CANDIDATE',
        profile: {},
        docs: [],
        profilePct: 0,
      }),
    );
    u.profilePct = candPct(u);
    await this.db.users.save(u);
    return {
      message: 'Verification code sent to your email',
      zodiac: sign,
      devOtp: await this.otp(u),
    };
  }

  /** Buyers (companies) choose which modules to buy at sign-up. */
  @Public()
  @Post('register-company')
  async registerCompany(@Body() b: any) {
    if (!b.email || !b.password || !b.companyName) {
      throw new BadRequestException('companyName, email, password required');
    }
    if (await this.db.users.findOneBy({ email: b.email.toLowerCase() })) {
      throw new ConflictException('Email already registered');
    }
    const modules = (b.modules || []).filter((m: string) =>
      MODULE_KEYS.includes(m),
    );
    const c = await this.db.companies.save(
      this.db.companies.create({
        name: b.companyName,
        state: b.state,
        country: b.country || 'IN',
        modules,
        atsPlan: b.atsPlan === 'PREMIUM' ? 'PREMIUM' : 'FREE',
        deviceKey: rid(24),
        settings: {},
      }),
    );
    const u = await this.db.users.save(
      this.db.users.create({
        email: b.email.toLowerCase(),
        passwordHash: await bcrypt.hash(b.password, 10),
        name: b.name || 'Super Admin',
        role: 'SUPER_ADMIN',
        kind: 'STAFF',
        companyId: c.id,
        profile: {},
        docs: [],
      }),
    );
    return {
      message: 'Company created. Verify the code sent to your email.',
      companyId: c.id,
      devOtp: await this.otp(u),
    };
  }

  @Public()
  @Post('verify')
  async verify(@Body() b: { email: string; otp: string }) {
    const u = await this.db.users.findOneBy({
      email: (b.email || '').toLowerCase(),
    });
    if (
      !u ||
      !u.otp ||
      u.otp !== sha(b.otp + u.email) ||
      new Date(u.otpExp) < new Date()
    ) {
      throw new BadRequestException('Invalid or expired code');
    }
    u.verified = true;
    u.otp = null;
    await this.db.users.save(u);
    return { token: this.token(u), user: clean(u) };
  }

  @Public()
  @Post('resend')
  async resend(@Body() b: { email: string }) {
    const u = await this.db.users.findOneBy({
      email: (b.email || '').toLowerCase(),
    });
    if (u && !u.verified) return { devOtp: await this.otp(u) };
    return { ok: true };
  }

  @Public()
  @Post('login')
  async login(@Body() b: LoginDto) {
    const id = b.email.toLowerCase();
    const u =
      (await this.db.users.findOneBy({ email: id })) ||
      (await this.db.users.findOneBy({ empId: b.email }));
    if (!u || !(await bcrypt.compare(b.password, u.passwordHash || ''))) {
      throw new UnauthorizedException('Wrong credentials');
    }
    if (!u.verified) throw new UnauthorizedException('Email not verified');
    if (!u.active) throw new UnauthorizedException('Account deactivated');
    return {
      token: this.token(u),
      user: clean(u),
      mustChangePwd: u.mustChangePwd,
    };
  }

  @Get('me')
  async me(@Me() u: User) {
    const c = u.companyId ? await this.db.company(u.companyId) : null;
    return {
      user: clean(u),
      company: c && {
        id: c.id,
        name: c.name,
        modules: c.modules,
        atsPlan: c.atsPlan,
      },
    };
  }

  @Post('change-password')
  async cp(
    @Me() u: User,
    @Body() b: { oldPassword: string; newPassword: string },
  ) {
    if (!(await bcrypt.compare(b.oldPassword, u.passwordHash))) {
      throw new UnauthorizedException('Old password wrong');
    }
    if ((b.newPassword || '').length < 8) {
      throw new BadRequestException('Min 8 characters');
    }
    u.passwordHash = await bcrypt.hash(b.newPassword, 10);
    u.mustChangePwd = false;
    await this.db.users.save(u);
    return { ok: true };
  }
}
