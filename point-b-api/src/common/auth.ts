import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** Global guard: verifies the bearer JWT, loads the user, then enforces @Roles(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; iat?: number }>(token);
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        // A password reset signs out every session issued before it.
        const stale = !!user?.passwordChangedAt && (payload.iat ?? 0) * 1000 < user.passwordChangedAt.getTime() - 1000;
        if (user && user.isActive && !stale) {
          req.user = { id: user.id, email: user.email, name: user.name, role: user.role } as AuthUser;
        }
      } catch {
        if (!isPublic) throw new UnauthorizedException('Invalid or expired session');
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Sign in required');

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
