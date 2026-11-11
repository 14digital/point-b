import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { isIP } from 'net';

/** Enough of an incoming request to work out who sent it. */
export interface IpSource { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }

const clean = (raw?: string) => {
  const ip = raw?.trim().replace(/^::ffff:/i, '').split('%')[0] ?? '';
  return isIP(ip) ? ip : null;
};

/** Addresses on a private network say nothing about where a visitor is. */
function isPublic(ip: string) {
  if (isIP(ip) === 6) return !/^(::1?$|f[cd]|fe[89ab])/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
}

/**
 * The visitor's public address; null for local traffic. Prices depend on this, so a visitor must not be able to fake it:
 * a browser can send any X-Forwarded-For it likes, but the real address is the last public one, added by our own proxy.
 */
export function clientIp(req: IpSource) {
  const direct = clean(req.socket?.remoteAddress);
  if (direct && isPublic(direct)) return direct; // nothing in front of the app, so forwarding headers mean nothing
  const header = (name: string) => { const v = req.headers[name]; return Array.isArray(v) ? v.join(',') : v; };
  if (process.env.BEHIND_CLOUDFLARE === 'true') {
    const ip = clean(header('cf-connecting-ip'));
    if (ip && isPublic(ip)) return ip;
  }
  const forwarded = (header('x-forwarded-for')?.split(',') ?? []).map(clean).filter((ip): ip is string => !!ip && isPublic(ip));
  if (forwarded.length) return forwarded[forwarded.length - 1];
  const real = clean(header('x-real-ip'));
  return real && isPublic(real) ? real : null;
}

type Lookup = { lookup: (ip: string) => { country?: string; city?: string } | null };
let geo: Lookup | null | undefined;

/** Country and city for an address, from a database on this server, so visitors' addresses never go to another company. */
export function locate(ip: string | null): { country?: string; city?: string } {
  if (!ip) return {};
  try {
    // Loaded on first use: it holds about 115 MB in memory.
    if (geo === undefined) geo = require('geoip-lite') as Lookup;
    const found = geo?.lookup(ip);
    return found?.country ? { country: found.country, ...(found.city ? { city: found.city.slice(0, 100) } : {}) } : {};
  } catch {
    geo = null; // tracking must never break a page
    return {};
  }
}

/** The visitor's country code, or null if unknown. DEV_VISITOR_COUNTRY lets local development preview a country. */
export function visitorCountry(req: IpSource): string | null {
  const ip = clientIp(req);
  const found = locate(ip).country;
  if (found) return found;
  return !ip && process.env.NODE_ENV !== 'production' ? process.env.DEV_VISITOR_COUNTRY?.trim().toUpperCase() || null : null;
}

export const VisitorCountry = createParamDecorator((_: unknown, ctx: ExecutionContext) => visitorCountry(ctx.switchToHttp().getRequest<IpSource>()));
