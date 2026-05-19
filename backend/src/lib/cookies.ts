import type { Request } from 'express';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = value;
  }
  return out;
}

export function serializeSessionCookie(req: Request, value: string, maxAgeSec?: number): string {
  const parts = [`session=${encodeURIComponent(value)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) parts.push('Secure');
  return parts.join('; ');
}
