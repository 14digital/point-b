import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../common/notifications.service';
import { webUrl } from '../common/email-template';
import { PasswordLinksService } from '../common/password-links.service';
import { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

const RESET_LINK_HOURS = 1;

const ageOn = (dob: Date) => Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notify: NotificationsService,
    private links: PasswordLinksService,
  ) {}

  async forgotPassword(rawEmail: string) {
    const user = await this.prisma.user.findUnique({ where: { email: rawEmail.toLowerCase() } });
    if (user?.isActive) {
      const { token } = await this.links.issue(user.id, RESET_LINK_HOURS);
      await this.notify.send(user.email, 'Reset your POINT B password', `Hi ${user.name.split(' ')[0]},\n\nWe received a request to reset your password. Use the button below to choose a new one. The link works once and expires in ${RESET_LINK_HOURS} hour.\n\nIf you didn't ask for this, you can ignore this email and your password will stay the same.`, user.id, { cta: { label: 'Choose a new password', url: `${webUrl()}/reset-password?token=${token}` } });
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

  private publicUser(u: { id: string; email: string; name: string; role: string; timezone: string; dateOfBirth: Date | null; guardianConsent: boolean }) {
    const isMinor = u.dateOfBirth ? ageOn(u.dateOfBirth) < 18 : false;
    return { id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, isMinor, guardianConsent: u.guardianConsent };
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
      },
    });
    await this.notify.send(email, 'Welcome to POINT B Mentors', `Hi ${user.name.split(' ')[0]},\n\nWelcome to POINT B Mentors. Your account is ready.\n\nBrowse mentors who have been where you want to go, pick a time that suits you, and book a private 30-minute conversation. Choose a 1:1 session, or a group session at a lower price per person.`, user.id, { cta: { label: 'Find a mentor', url: `${webUrl()}/mentors` } });
    if (dateOfBirth && user.guardianEmail && ageOn(dateOfBirth) < 18) {
      await this.notify.send(
        user.guardianEmail,
        'Guardian consent request — POINT B Mentors',
        `${user.name} has registered for POINT B Mentors. Because they are under 18, we need a parent or guardian to give consent before they can book sessions.\n\nIf you were not expecting this message, please ignore it or contact our support team.`,
        undefined,
        { cta: { label: 'Contact support', url: `${webUrl()}/contact` } },
      );
    }
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const ok = user && user.isActive && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Incorrect email or password');
    return this.session(user);
  }

  async me(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: { mentorProfile: { select: { id: true, slug: true, status: true } } } });
    return { ...this.publicUser(user), mentorProfile: user.mentorProfile };
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
