import { Router } from 'express';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfigHealth = {
  turnConfigured: boolean;
  hasTurnServers: boolean;
  configuredSources: string[];
  acceptedCloudflareTokenEnv: string[];
};

const DEFAULT_STUN_SERVERS: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const CLOUDFLARE_TURN_TTL_SECONDS = 86_400;
const CLOUDFLARE_CACHE_SKEW_MS = 5 * 60 * 1000;
const CLOUDFLARE_TURN_MINT_TIMEOUT_MS = 4000;

type CachedTurn = {
  servers: IceServerConfig[];
  expiresAtMs: number;
};

let cloudflareCache: CachedTurn | null = null;

export function iceConfigRouter(): Router {
  const router = Router();

  router.get('/ice-config', async (_req, res) => {
    const iceServers = await getIceServersFromEnv();
    res.json({ iceServers });
  });

  router.get('/ice-config/health', async (_req, res) => {
    res.json(await getIceConfigHealthFromEnv());
  });

  return router;
}

export async function getIceServersFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<IceServerConfig[]> {
  const servers = [...DEFAULT_STUN_SERVERS];
  const staticTurn = readStaticTurn(env);
  if (staticTurn) servers.push(staticTurn);

  const cloudflareTurn = await readCloudflareTurn(env);
  if (cloudflareTurn.length > 0) servers.push(...cloudflareTurn);

  return servers;
}

export async function getIceConfigHealthFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<IceConfigHealth> {
  const iceServers = await getIceServersFromEnv(env);
  const configuredSources = readConfiguredTurnSources(env);
  return {
    turnConfigured: configuredSources.length > 0,
    hasTurnServers: iceServers.some(hasTurnServer),
    configuredSources,
    acceptedCloudflareTokenEnv: ['TURN_API_Key', 'TURN_API_KEY', 'MEET_CLOUDFLARE_TURN_TOKEN', 'CLOUDFLARE_TURN_TOKEN'],
  };
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

async function readCloudflareTurn(env: NodeJS.ProcessEnv): Promise<IceServerConfig[]> {
  const keyId = firstPresent(env.TURN_ID, env.MEET_CLOUDFLARE_TURN_SERVICE_ID, env.CLOUDFLARE_TURN_SERVICE_ID);
  const token = firstPresent(env.TURN_API_Key, env.TURN_API_KEY, env.MEET_CLOUDFLARE_TURN_TOKEN, env.CLOUDFLARE_TURN_TOKEN);
  if (!keyId && !token) return [];
  if (!keyId || !token) {
    console.warn('[ice-config] ignoring incomplete Cloudflare TURN env; require TURN_ID and TURN_API_Key or TURN_API_KEY');
    return [];
  }

  if (cloudflareCache && cloudflareCache.expiresAtMs > Date.now()) return cloudflareCache.servers;

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
      return [];
    }

    const json = (await response.json()) as { iceServers?: unknown };
    const servers = normalizeCloudflareIceServers(json.iceServers);
    if (servers.length === 0) {
      console.warn('[ice-config] Cloudflare TURN mint returned malformed iceServers');
      return [];
    }

    cloudflareCache = {
      servers,
      expiresAtMs: Date.now() + CLOUDFLARE_TURN_TTL_SECONDS * 1000 - CLOUDFLARE_CACHE_SKEW_MS,
    };
    return servers;
  } catch (err) {
    console.warn(`[ice-config] Cloudflare TURN mint request failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export function clearIceConfigCacheForTests(): void {
  cloudflareCache = null;
}

function normalizeCloudflareIceServers(raw: unknown): IceServerConfig[] {
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.flatMap(normalizeCloudflareIceServer);
}

function normalizeCloudflareIceServer(raw: unknown): IceServerConfig[] {
  const value = raw as { urls?: unknown; username?: unknown; credential?: unknown };
  const urls = Array.isArray(value?.urls) ? value.urls.filter((url): url is string => typeof url === 'string' && !!url.trim()) : [];
  const username = typeof value?.username === 'string' ? value.username : '';
  const credential = typeof value?.credential === 'string' ? value.credential : '';
  const stunUrls = urls.filter((url) => url.toLowerCase().startsWith('stun:'));
  const turnUrls = urls.filter((url) => url.toLowerCase().startsWith('turn:') || url.toLowerCase().startsWith('turns:'));
  const servers: IceServerConfig[] = [];

  if (stunUrls.length > 0) servers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  if (turnUrls.length > 0 && username && credential) {
    const normalizedTurnUrls = withTurnTls443Fallback(turnUrls);
    servers.push({ urls: normalizedTurnUrls.length === 1 ? normalizedTurnUrls[0] : normalizedTurnUrls, username, credential });
  }

  return servers;
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

function readConfiguredTurnSources(env: NodeJS.ProcessEnv): string[] {
  const sources: string[] = [];
  const staticUrls = parseUrlList(env.MEET_TURN_URLS || env.TURN_URLS);
  const staticUsername = firstPresent(env.MEET_TURN_USERNAME, env.TURN_USERNAME);
  const staticCredential = firstPresent(env.MEET_TURN_CREDENTIAL, env.TURN_CREDENTIAL);
  if (staticUrls.length > 0 && staticUsername && staticCredential) sources.push('static');

  const cloudflareId = firstPresent(env.TURN_ID, env.MEET_CLOUDFLARE_TURN_SERVICE_ID, env.CLOUDFLARE_TURN_SERVICE_ID);
  const cloudflareToken = firstPresent(env.TURN_API_Key, env.TURN_API_KEY, env.MEET_CLOUDFLARE_TURN_TOKEN, env.CLOUDFLARE_TURN_TOKEN);
  if (cloudflareId && cloudflareToken) sources.push('cloudflare');
  return sources;
}

function hasTurnServer(server: IceServerConfig): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.toLowerCase().startsWith('turn:') || url.toLowerCase().startsWith('turns:'));
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
