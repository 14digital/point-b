import { GoneException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Single-use links for setting or resetting a password. Only a SHA-256 hash of the token is stored,
 * and issuing a new link replaces the previous one.
 */
@Injectable()
export class PasswordLinksService {
  constructor(private prisma: PrismaService) {}

  async issue(userId: string, hours: number) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + hours * 3600_000);
    await this.prisma.user.update({ where: { id: userId }, data: { resetTokenHash: hash(token), resetTokenExpiresAt: expiresAt } });
    return { token, expiresAt };
  }

  async find(token: string) {
    const user = token.length >= 20 ? await this.prisma.user.findFirst({ where: { resetTokenHash: hash(token), isActive: true } }) : null;
    if (!user) throw new GoneException('This link is no longer valid. It may have been used already or replaced by a newer email.');
    if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) throw new GoneException('This link has expired. Request a new one from the sign-in page.');
    return user;
  }

  /** Sets the password and burns the token in one guarded write, so a link can never be used twice. */
  async consume(token: string, passwordHash: string) {
    const user = await this.find(token);
    const done = await this.prisma.user.updateMany({
      where: { id: user.id, resetTokenHash: hash(token) },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, passwordChangedAt: new Date() },
    });
    if (done.count === 0) throw new GoneException('This link is no longer valid.');
    return user;
  }
}
