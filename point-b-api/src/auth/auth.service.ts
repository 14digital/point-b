import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { webUrl } from '../common/email-template';
import { PasswordLinksService } from '../common/password-links.service';
import { ChangePasswordDto, DisableTwoFactorDto, LoginCodeDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateContactDto } from './auth.dto';
import { hashRecovery, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from '../common/totp';
import { normalisePhone } from '../common/phone';
import { ActivityService } from '../activity/activity.service';

const RESET_LINK_HOURS = 1;

const ageOn = (dob: Date) => Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notify: NotificationsService,
    private links: PasswordLinksService,
    private activity: ActivityService,
  ) {}

  async forgotPassword(rawEmail: string) {
    const user = await this.prisma.user.findUnique({ where: { email: rawEmail.toLowerCase() } });
    if (user?.isActive) {
      const { token } = await this.links.issue(user.id, RESET_LINK_HOURS);
      await this.notify.send(user.email, 'Reset your POINT B password', `Hi ${user.name.split(' ')[0]},\n\nWe received a request to reset your password. Use the button below to choose a new one. The link works once and expires in ${RESET_LINK_HOURS} hour.\n\nIf you didn't ask for this, you can ignore this email and your password will stay the same.`, user.id, { cta: { label: 'Choose a new password', url: `${webUrl()}/reset-password?token=${token}` }, emailOnly: true });
    }
    return { ok: true };
  }

  async passwordLink(token: string) {
    const u = await this.links.find(token);
    return { email: u.email, name: u.name, firstTime: !u.passwordChangedAt && u.role === 'MENTOR' };
  }

  /** Sets the new password and signs the user straight in. */
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.links.consume(dto.token, await bcrypt.hash(dto.password, 12));
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.session(fresh);
  }

  private publicUser(u: { id: string; email: string; name: string; role: string; timezone: string; dateOfBirth: Date | null; guardianConsent: boolean; phone: string | null; whatsappAlerts: boolean; staffRole?: string | null; totpEnabledAt?: Date | null }) {
    const isMinor = u.dateOfBirth ? ageOn(u.dateOfBirth) < 18 : false;
    const staff = u.role === 'ADMIN' ? { staffRole: u.staffRole ?? 'OWNER', twoFactorEnabled: !!u.totpEnabledAt } : {};
    return { id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, isMinor, guardianConsent: u.guardianConsent, phone: u.phone, whatsappAlerts: u.whatsappAlerts, ...staff };
  }

  private async session(user: Parameters<AuthService['publicUser']>[0]) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, user: this.publicUser(user) };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    let dateOfBirth: Date | undefined;
    if (dto.dateOfBirth) {
      dateOfBirth = new Date(dto.dateOfBirth);
      const age = ageOn(dateOfBirth);
      if (age < 13) throw new BadRequestException('You must be at least 13 to use POINT B Mentors');
      if (age < 18 && !dto.guardianEmail) {
        throw new BadRequestException('A parent or guardian email is required for students under 18');
      }
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: 'STUDENT',
        dateOfBirth,
        guardianEmail: dto.guardianEmail?.toLowerCase(),
        timezone: dto.timezone ?? 'Asia/Karachi',
        phone: normalisePhone(dto.phone),
        whatsappAlerts: dto.whatsappAlerts ?? true,
      },
    });
    await this.notify.send(email, 'Welcome to POINT B Mentors', `Hi ${user.name.split(' ')[0]},\n\nWelcome to POINT B Mentors. Your account is ready.\n\nBrowse mentors who have been where you want to go, pick a time that suits you, and book a private 30-minute conversation. Choose a 1:1 session, or a group session at a lower price per person.`, user.id, { cta: { label: 'Find a mentor', url: `${webUrl()}/mentors` }, whatsapp: false });
    if (dateOfBirth && user.guardianEmail && ageOn(dateOfBirth) < 18) {
      await this.notify.send(
        user.guardianEmail,
        'Guardian consent request — POINT B Mentors',
        `${user.name} has registered for POINT B Mentors. Because they are under 18, we need a parent or guardian to give consent before they can book sessions.\n\nIf you were not expecting this message, please ignore it or contact our support team.`,
        undefined,
        { cta: { label: 'Contact support', url: `${webUrl()}/contact` } },
      );
    }
    this.activity.record(user.id, 'registered');
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const ok = user && user.isActive && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Incorrect email or password');
    if (user.role !== 'ADMIN') this.activity.record(user.id, 'signed_in');
    // Admins with two-step sign-in get a 5-minute token that only works for entering their code.
    if (user.role === 'ADMIN' && user.totpEnabledAt && user.totpSecret) {
      return { mfaRequired: true as const, mfaToken: await this.jwt.signAsync({ sub: user.id, purpose: 'mfa' }, { expiresIn: '5m' }) };
    }
    return this.session(user);
  }

  async loginWithCode(dto: LoginCodeDto) {
    let sub: string;
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; purpose?: string }>(dto.mfaToken);
      if (p.purpose !== 'mfa') throw new Error();
      sub = p.sub;
    } catch {
      throw new UnauthorizedException('That sign-in has expired. Please enter your password again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user?.isActive || !user.totpSecret) throw new UnauthorizedException('That sign-in has expired. Please enter your password again.');
    if (verifyTotp(user.totpSecret, dto.code)) return this.session(user);
    // A backup code works once.
    const h = hashRecovery(dto.code);
    if (user.totpRecoveryHashes.includes(h)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { totpRecoveryHashes: user.totpRecoveryHashes.filter((x) => x !== h) } });
      await this.prisma.auditLog.create({ data: { adminId: user.id, action: 'BACKUP_CODE_USED', entityType: 'User', entityId: user.id, detail: `${user.totpRecoveryHashes.length - 1} backup codes left` } });
      return this.session(user);
    }
    throw new UnauthorizedException('That code is not right. Check your authenticator app and try again.');
  }

  /** Starts two-step sign-in: a new secret that only takes effect once a code from it is confirmed. */
  async startTwoFactor(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = newTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpPendingSecret: secret } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpPendingSecret || !verifyTotp(user.totpPendingSecret, code)) throw new BadRequestException('That code is not right. Make sure the time on your phone is correct, then try the newest code.');
    const { codes, hashes } = newRecoveryCodes();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: new Date(), totpRecoveryHashes: hashes } });
    await this.prisma.auditLog.create({ data: { adminId: userId, action: 'TWO_STEP_ENABLED', entityType: 'User', entityId: userId, detail: '' } });
    return { recoveryCodes: codes };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) throw new BadRequestException('Your password is not right.');
    if (!user.totpSecret || !(verifyTotp(user.totpSecret, dto.code) || user.totpRecoveryHashes.includes(hashRecovery(dto.code)))) throw new BadRequestException('That code is not right.');
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpRecoveryHashes: [] } });
    await this.prisma.auditLog.create({ data: { adminId: userId, action: 'TWO_STEP_DISABLED', entityType: 'User', entityId: userId, detail: '' } });
    return { ok: true };
  }

  async newBackupCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) throw new BadRequestException('That code is not right.');
    const { codes, hashes } = newRecoveryCodes();
    await this.prisma.user.update({ where: { id: userId }, data: { totpRecoveryHashes: hashes } });
    return { recoveryCodes: codes, left: codes.length };
  }

  async twoFactorStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true, totpRecoveryHashes: true } });
    return { enabled: !!user.totpEnabledAt, enabledAt: user.totpEnabledAt, backupCodesLeft: user.totpRecoveryHashes.length };
  }

  async me(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: { mentorProfile: { select: { id: true, slug: true, status: true } } } });
    return { ...this.publicUser(user), mentorProfile: user.mentorProfile };
  }

  /** Lets a signed-in user add or change their mobile number and WhatsApp alert preference. */
  async updateContact(id: string, dto: UpdateContactDto) {
    const data: { phone?: string | null; whatsappAlerts?: boolean } = {};
    if (dto.phone !== undefined) data.phone = normalisePhone(dto.phone);
    if (dto.whatsappAlerts !== undefined) data.whatsappAlerts = dto.whatsappAlerts;
    await this.prisma.user.update({ where: { id }, data });
    return this.me(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } });
    return { ok: true };
  }
}
