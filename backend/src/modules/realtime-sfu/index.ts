import { Router } from 'express';
import type { Response } from 'express';
import { isAdmittedDiagnosticPoster } from '../signaling/index.js';
import {
  buildSfuFaultInjectResponse,
  matchSfuFaultInject,
  parseSfuFaultInjectRules,
  type SfuFaultInjectEndpoint,
} from './sfu-fault-inject.js';

export { clearSfuFaultInjectForTests, setSfuFaultInjectRulesForTests } from './sfu-fault-inject.js';

const CF_BASE = 'https://rtc.live.cloudflare.com/v1/apps';

// Process-local ownership map — ephemeral; reconnect re-establishes in B7
const sessionOwners = new Map<string, { clientKey: string; participantId: string }>();

export function clearSfuSessionOwnersForTests(): void {
  sessionOwners.clear();
}

export function setSfuSessionOwnerForTests(
  cfSessionId: string,
  owner: { clientKey: string; participantId: string },
): void {
  sessionOwners.set(cfSessionId, owner);
}

function getCfCredentials(env: NodeJS.ProcessEnv = process.env): { appId: string; token: string } | null {
  const appId = env.SFU_APP_ID?.trim();
  const token = env.SFU_TOKEN?.trim();
  if (!appId || !token) return null;
  return { appId, token };
}

function cfUrl(appId: string, ...segments: string[]): string {
  return [CF_BASE, appId, ...segments].join('/');
}

type CfResult = { ok: boolean; status: number; data: unknown };

async function cfFetch(method: string, url: string, token: string, body?: unknown): Promise<CfResult> {
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(url, init);
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, data };
}

function sanitizeCfError(data: unknown): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.errorDescription === 'string' && d.errorDescription) return d.errorDescription;
    if (typeof d.error === 'string' && d.error) return d.error;
  }
  return 'CF API error';
}

type Caller = { clientKey: string; participantId: string; sessionId: string };

function extractCaller(source: Record<string, unknown>): Caller | null {
  const clientKey = typeof source.clientKey === 'string' ? source.clientKey.trim() : '';
  const participantId = typeof source.participantId === 'string' ? source.participantId.trim() : '';
  const sessionId = typeof source.sessionId === 'string' ? source.sessionId.trim() : '';
  if (!clientKey || !participantId || !sessionId) return null;
  return { clientKey, participantId, sessionId };
}

function checkAdmitted(caller: Caller, res: Response): boolean {
  const ok = isAdmittedDiagnosticPoster({ sessionId: caller.sessionId, clientKey: caller.clientKey, participantId: caller.participantId });
  if (!ok) { res.status(403).json({ error: 'forbidden' }); return false; }
  return true;
}

function ownsSession(cfSessionId: string, caller: Caller): boolean {
  const owner = sessionOwners.get(cfSessionId);
  return !!owner && owner.clientKey === caller.clientKey && owner.participantId === caller.participantId;
}

function safeBody(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function forwardBody(body: Record<string, unknown>): Record<string, unknown> {
  const { clientKey: _ck, participantId: _pid, sessionId: _sid, cfSessionId: _cfsid, ...rest } = body;
  return rest;
}

function cfSidFrom(body: Record<string, unknown>): string | null {
  const id = typeof body.cfSessionId === 'string' ? body.cfSessionId.trim() : '';
  return id || null;
}

function maybeInjectSfuFault(
  endpoint: SfuFaultInjectEndpoint,
  caller: Caller,
  body: Record<string, unknown>,
  res: Response,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const match = matchSfuFaultInject(parseSfuFaultInjectRules(env), endpoint, caller, body);
  if (!match) return false;
  const injected = buildSfuFaultInjectResponse(match);
  res.status(injected.status).json({ error: injected.body.errorDescription, ...injected.body });
  return true;
}

export function realtimeSfuRouter(): Router {
  const router = Router();

  router.post('/sfu/session', async (req, res) => {
    const creds = getCfCredentials();
    if (!creds) return res.status(503).json({ error: 'SFU not configured' });

    const body = safeBody(req.body);
    const caller = extractCaller(body);
    if (!caller) return res.status(400).json({ error: 'clientKey, participantId, and sessionId required' });
    if (!checkAdmitted(caller, res)) return;

    let result: CfResult;
    try {
      result = await cfFetch('POST', cfUrl(creds.appId, 'sessions', 'new'), creds.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[sfu] sessions/new error: ${msg}`);
      return res.status(502).json({ error: `CF unreachable: ${msg} — check SFU_APP_ID/SFU_TOKEN and network` });
    }

    if (!result.ok) return res.status(result.status).json({ error: sanitizeCfError(result.data), status: result.status });

    const data = result.data as Record<string, unknown>;
    const cfSessionId = typeof data.sessionId === 'string' ? data.sessionId : null;
    if (!cfSessionId) return res.status(502).json({ error: 'CF returned no sessionId' });

    sessionOwners.set(cfSessionId, { clientKey: caller.clientKey, participantId: caller.participantId });
    return res.json({ sessionId: cfSessionId });
  });

  router.post('/sfu/tracks', async (req, res) => {
    const creds = getCfCredentials();
    if (!creds) return res.status(503).json({ error: 'SFU not configured' });

    const body = safeBody(req.body);
    const caller = extractCaller(body);
    if (!caller) return res.status(400).json({ error: 'clientKey, participantId, and sessionId required' });
    if (!checkAdmitted(caller, res)) return;

    const cfSid = cfSidFrom(body);
    if (!cfSid) return res.status(400).json({ error: 'cfSessionId required' });
    if (!ownsSession(cfSid, caller)) return res.status(403).json({ error: 'forbidden' });
    if (maybeInjectSfuFault('tracks', caller, body, res)) return;

    let result: CfResult;
    try {
      result = await cfFetch('POST', cfUrl(creds.appId, 'sessions', cfSid, 'tracks', 'new'), creds.token, forwardBody(body));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return res.status(502).json({ error: `CF unreachable: ${msg}` });
    }

    if (!result.ok) return res.status(result.status).json({ error: sanitizeCfError(result.data), status: result.status });
    return res.json(result.data);
  });

  router.put('/sfu/tracks/update', async (req, res) => {
    const creds = getCfCredentials();
    if (!creds) return res.status(503).json({ error: 'SFU not configured' });

    const body = safeBody(req.body);
    const caller = extractCaller(body);
    if (!caller) return res.status(400).json({ error: 'clientKey, participantId, and sessionId required' });
    if (!checkAdmitted(caller, res)) return;

    const cfSid = cfSidFrom(body);
    if (!cfSid) return res.status(400).json({ error: 'cfSessionId required' });
    if (!ownsSession(cfSid, caller)) return res.status(403).json({ error: 'forbidden' });

    let result: CfResult;
    try {
      result = await cfFetch('PUT', cfUrl(creds.appId, 'sessions', cfSid, 'tracks', 'update'), creds.token, forwardBody(body));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return res.status(502).json({ error: `CF unreachable: ${msg}` });
    }

    if (!result.ok) return res.status(result.status).json({ error: sanitizeCfError(result.data), status: result.status });
    return res.json(result.data);
  });

  router.put('/sfu/renegotiate', async (req, res) => {
    const creds = getCfCredentials();
    if (!creds) return res.status(503).json({ error: 'SFU not configured' });

    const body = safeBody(req.body);
    const caller = extractCaller(body);
    if (!caller) return res.status(400).json({ error: 'clientKey, participantId, and sessionId required' });
    if (!checkAdmitted(caller, res)) return;

    const cfSid = cfSidFrom(body);
    if (!cfSid) return res.status(400).json({ error: 'cfSessionId required' });
    if (!ownsSession(cfSid, caller)) return res.status(403).json({ error: 'forbidden' });

    let result: CfResult;
    try {
      result = await cfFetch('PUT', cfUrl(creds.appId, 'sessions', cfSid, 'renegotiate'), creds.token, forwardBody(body));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return res.status(502).json({ error: `CF unreachable: ${msg}` });
    }

    if (!result.ok) return res.status(result.status).json({ error: sanitizeCfError(result.data), status: result.status });
    return res.json(result.data);
  });

  router.put('/sfu/tracks/close', async (req, res) => {
    const creds = getCfCredentials();
    if (!creds) return res.status(503).json({ error: 'SFU not configured' });

    const body = safeBody(req.body);
    const caller = extractCaller(body);
    if (!caller) return res.status(400).json({ error: 'clientKey, participantId, and sessionId required' });
    if (!checkAdmitted(caller, res)) return;

    const cfSid = cfSidFrom(body);
    if (!cfSid) return res.status(400).json({ error: 'cfSessionId required' });
    if (!ownsSession(cfSid, caller)) return res.status(403).json({ error: 'forbidden' });

    let result: CfResult;
    try {
      result = await cfFetch('PUT', cfUrl(creds.appId, 'sessions', cfSid, 'tracks', 'close'), creds.token, forwardBody(body));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return res.status(502).json({ error: `CF unreachable: ${msg}` });
    }

    if (!result.ok) return res.status(result.status).json({ error: sanitizeCfError(result.data), status: result.status });
    return res.json(result.data);
  });

  router.get('/sfu/session/:cfSessionId', async (req, res) => {
    const creds = getCfCredentials();
    if (!creds) return res.status(503).json({ error: 'SFU not configured' });

    const cfSid = req.params.cfSessionId;
    const caller = extractCaller(req.query as Record<string, unknown>);
    if (!caller) return res.status(400).json({ error: 'clientKey, participantId, and sessionId query params required' });
    if (!checkAdmitted(caller, res)) return;
    if (!ownsSession(cfSid, caller)) return res.status(403).json({ error: 'forbidden' });

    let result: CfResult;
    try {
      result = await cfFetch('GET', cfUrl(creds.appId, 'sessions', cfSid), creds.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return res.status(502).json({ error: `CF unreachable: ${msg}` });
    }

    if (!result.ok) return res.status(result.status).json({ error: sanitizeCfError(result.data), status: result.status });
    return res.json(result.data);
  });

  return router;
}
