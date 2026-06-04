export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
export const ICE_CONFIG_FETCH_TIMEOUT_MS = 5000;
export const ICE_CONFIG_MAX_ATTEMPTS = 3;
export const ICE_CONFIG_RETRY_BACKOFF_MS = [250, 750] as const;

export type IceConfigOutcome = 'use' | 'retry' | 'relay-unavailable';

export type IceConfigDecisionParams = {
  fetchOk: boolean;
  hasUsableServers: boolean;
  attempt: number;
  maxAttempts: number;
};

export function decideIceConfigOutcome(params: IceConfigDecisionParams): IceConfigOutcome {
  if (params.fetchOk && params.hasUsableServers) return 'use';
  return params.attempt < params.maxAttempts ? 'retry' : 'relay-unavailable';
}

export function iceServersFromConfigPayload(payload: { iceServers?: unknown } | null | undefined): RTCIceServer[] {
  const rawServers = Array.isArray(payload?.iceServers) ? payload.iceServers : [];
  return dedupeIceServers(rawServers.flatMap(normalizeIceServer));
}

export function iceServersHaveTurn(iceServers: RTCIceServer[]): boolean {
  return iceServers.some(hasTurnUrl);
}

function normalizeIceServer(raw: unknown): RTCIceServer[] {
  const value = raw as RTCIceServer | null;
  const urls = normalizeUrlList(value?.urls);
  if (urls.length === 0) return [];

  const turnUrls = urls.filter((url) => url.toLowerCase().startsWith('turn:') || url.toLowerCase().startsWith('turns:'));
  const normalizedUrls = turnUrls.length > 0 ? withTurnTls443Fallback(urls) : urls;
  return [{
    urls: normalizedUrls.length === 1 ? normalizedUrls[0] : normalizedUrls,
    username: typeof value?.username === 'string' ? value.username : undefined,
    credential: value?.credential,
  }];
}

function normalizeUrlList(raw: RTCIceServer['urls'] | unknown): string[] {
  const urls = Array.isArray(raw) ? raw : [raw];
  return urls.filter((url): url is string => typeof url === 'string' && !!url.trim()).map((url) => url.trim());
}

function dedupeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  const next: RTCIceServer[] = [];
  for (const server of servers) {
    const key = JSON.stringify({
      urls: Array.isArray(server.urls) ? server.urls : [server.urls],
      username: server.username ?? '',
      credential: server.credential ?? '',
    });
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(server);
  }
  return next;
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

function hasTurnUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => typeof url === 'string' && url.toLowerCase().startsWith('turn'));
}
