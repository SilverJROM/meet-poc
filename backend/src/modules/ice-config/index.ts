import { Router } from 'express';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const DEFAULT_STUN_SERVERS: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

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
  const token = firstPresent(env.MEET_CLOUDFLARE_TURN_TOKEN, env.CLOUDFLARE_TURN_TOKEN);
  const serviceId = firstPresent(env.MEET_CLOUDFLARE_TURN_SERVICE_ID, env.CLOUDFLARE_TURN_SERVICE_ID);
  if (!token && !serviceId) return null;

  // TODO(DR-5): wire the exact Cloudflare TURN mint endpoint once JROM provides
  // the account/service details. Static long-term TURN remains fully supported.
  console.warn('[ice-config] Cloudflare TURN env present but mint API is not configured yet; serving STUN/static TURN only');
  return null;
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
