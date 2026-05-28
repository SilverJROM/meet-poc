import { Router } from 'express';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const DEFAULT_STUN_SERVERS: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const CLOUDFLARE_TURN_TTL_SECONDS = 86_400;
const CLOUDFLARE_CACHE_SKEW_MS = 5 * 60 * 1000;
const CLOUDFLARE_TURN_MINT_TIMEOUT_MS = 4000;

type CachedTurn = {
  server: IceServerConfig;
  expiresAtMs: number;
};

let cloudflareCache: CachedTurn | null = null;

export function iceConfigRouter(): Router {
  const router = Router();

  router.get('/ice-config', async (_req, res) => {
    const iceServers = await getIceServersFromEnv();
    res.json({ iceServers });
  });

  return router;
}

export async function getIceServersFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<IceServerConfig[]> {
  const servers = [...DEFAULT_STUN_SERVERS];
  const staticTurn = readStaticTurn(env);
  if (staticTurn) servers.push(staticTurn);

  const cloudflareTurn = await readCloudflareTurn(env);
  if (cloudflareTurn) servers.push(cloudflareTurn);

  return servers;
}

function readStaticTurn(env: NodeJS.ProcessEnv): IceServerConfig | null {
  const urls = parseUrlList(env.MEET_TURN_URLS || env.TURN_URLS);
  const username = firstPresent(env.MEET_TURN_USERNAME, env.TURN_USERNAME);
  const credential = firstPresent(env.MEET_TURN_CREDENTIAL, env.TURN_CREDENTIAL);

  if (urls.length === 0 && !username && !credential) return null;
  if (urls.length === 0 || !username || !credential) {
    console.warn('[ice-config] ignoring incomplete static TURN env; require MEET_TURN_URLS, MEET_TURN_USERNAME, MEET_TURN_CREDENTIAL');
    return null;
  }

  return { urls: urls.length === 1 ? urls[0] : urls, username, credential };
}

async function readCloudflareTurn(env: NodeJS.ProcessEnv): Promise<IceServerConfig | null> {
  const keyId = firstPresent(env.TURN_ID, env.MEET_CLOUDFLARE_TURN_SERVICE_ID, env.CLOUDFLARE_TURN_SERVICE_ID);
  const token = firstPresent(env.TURN_API_Key, env.MEET_CLOUDFLARE_TURN_TOKEN, env.CLOUDFLARE_TURN_TOKEN);
  if (!keyId && !token) return null;
  if (!keyId || !token) {
    console.warn('[ice-config] ignoring incomplete Cloudflare TURN env; require TURN_ID and TURN_API_Key');
    return null;
  }

  if (cloudflareCache && cloudflareCache.expiresAtMs > Date.now()) return cloudflareCache.server;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUDFLARE_TURN_MINT_TIMEOUT_MS);
  try {
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: CLOUDFLARE_TURN_TTL_SECONDS }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[ice-config] Cloudflare TURN mint failed with status ${response.status}`);
      return null;
    }

    const json = (await response.json()) as { iceServers?: unknown };
    const server = normalizeCloudflareIceServer(json.iceServers);
    if (!server) {
      console.warn('[ice-config] Cloudflare TURN mint returned malformed iceServers');
      return null;
    }

    cloudflareCache = {
      server,
      expiresAtMs: Date.now() + CLOUDFLARE_TURN_TTL_SECONDS * 1000 - CLOUDFLARE_CACHE_SKEW_MS,
    };
    return server;
  } catch (err) {
    console.warn(`[ice-config] Cloudflare TURN mint request failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function clearIceConfigCacheForTests(): void {
  cloudflareCache = null;
}

function normalizeCloudflareIceServer(raw: unknown): IceServerConfig | null {
  const value = raw as { urls?: unknown; username?: unknown; credential?: unknown };
  const urls = Array.isArray(value?.urls) ? value.urls.filter((url): url is string => typeof url === 'string' && !!url.trim()) : [];
  const username = typeof value?.username === 'string' ? value.username : '';
  const credential = typeof value?.credential === 'string' ? value.credential : '';
  if (urls.length === 0 || !username || !credential) return null;
  return { urls: withTurnTls443Fallback(urls), username, credential };
}

function parseUrlList(raw: string | undefined): string[] {
  return String(raw || '')
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function firstPresent(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim())?.trim();
}

function withTurnTls443Fallback(urls: string[]): string[] {
  if (urls.some(isTurnTls443Url)) return urls;

  const tlsTurnUrl = urls.find((url) => {
    const parsed = parseTurnUrl(url);
    return parsed?.protocol === 'turns:' && !!parsed.hostname;
  });
  const parsed = tlsTurnUrl ? parseTurnUrl(tlsTurnUrl) : null;
  if (!parsed) return urls;

  return [...urls, `turns:${parsed.hostname}:443?transport=tcp`];
}

function isTurnTls443Url(url: string): boolean {
  const parsed = parseTurnUrl(url);
  return parsed?.protocol === 'turns:' && parsed.port === '443';
}

type ParsedTurnUrl = {
  protocol: 'turn:' | 'turns:';
  hostname: string;
  port: string;
};

function parseTurnUrl(url: string): ParsedTurnUrl | null {
  if (!/^turns?:/i.test(url)) return null;

  try {
    const [, rawProtocol = '', rawAddress = ''] = /^(turns?):([^?]+)/i.exec(url) || [];
    const parsed = new URL(`https://${rawAddress}`);
    if (!parsed.hostname) return null;
    return {
      protocol: `${rawProtocol.toLowerCase()}:` as ParsedTurnUrl['protocol'],
      hostname: parsed.hostname,
      port: parsed.port || readExplicitPort(rawAddress),
    };
  } catch {
    return null;
  }
}

function readExplicitPort(address: string): string {
  return address.match(/:(\d+)$/)?.[1] || '';
}
