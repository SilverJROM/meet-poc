export type SfuFaultInjectEndpoint =
  | 'session'
  | 'tracks'
  | 'tracks-update'
  | 'renegotiate'
  | 'tracks-close';

export type SfuFaultInjectRule = {
  endpoint: SfuFaultInjectEndpoint;
  matchParticipantId?: string;
  matchTrackName?: string;
  // 'tracks' carries both local (own publish) and remote (subscribe) track-new calls in the same
  // endpoint, distinguished by each track entry's `location`. Lets a rule target only the subscribe
  // direction without needing to predict a not-yet-generated remote track name (B6).
  matchLocation?: 'local' | 'remote';
  status: number;
  errorDescription?: string;
  errorCode?: string;
};

export type SfuFaultInjectMatch = {
  rule: SfuFaultInjectRule;
  endpoint: SfuFaultInjectEndpoint;
};

type FaultInjectCaller = { participantId: string };

let testRulesOverride: SfuFaultInjectRule[] | null | undefined;

export function clearSfuFaultInjectForTests(): void {
  testRulesOverride = undefined;
}

export function setSfuFaultInjectRulesForTests(rules: SfuFaultInjectRule[] | null): void {
  testRulesOverride = rules;
}

function faultInjectEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.SFU_FAULT_INJECT === '1';
}

export function sanitizeSfuFaultInjectRules(parsed: unknown): SfuFaultInjectRule[] | null {
  if (!Array.isArray(parsed)) return null;

  const rules: SfuFaultInjectRule[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const rule = entry as Record<string, unknown>;
    const endpoint = rule.endpoint;
    const status = rule.status;
    if (typeof endpoint !== 'string' || typeof status !== 'number' || !Number.isFinite(status)) continue;
    if (
      endpoint !== 'session' &&
      endpoint !== 'tracks' &&
      endpoint !== 'tracks-update' &&
      endpoint !== 'renegotiate' &&
      endpoint !== 'tracks-close'
    ) {
      continue;
    }
    const matchLocation = rule.matchLocation === 'local' || rule.matchLocation === 'remote' ? rule.matchLocation : undefined;
    rules.push({
      endpoint,
      matchParticipantId: typeof rule.matchParticipantId === 'string' ? rule.matchParticipantId : undefined,
      matchTrackName: typeof rule.matchTrackName === 'string' ? rule.matchTrackName : undefined,
      matchLocation,
      status: Math.trunc(status),
      errorDescription: typeof rule.errorDescription === 'string' ? rule.errorDescription : undefined,
      errorCode: typeof rule.errorCode === 'string' ? rule.errorCode : undefined,
    });
  }
  return rules.length ? rules : null;
}

export function parseSfuFaultInjectRules(env: NodeJS.ProcessEnv = process.env): SfuFaultInjectRule[] | null {
  if (testRulesOverride !== undefined) return testRulesOverride;
  if (!faultInjectEnabled(env)) return null;

  const raw = env.SFU_FAULT_INJECT_RULES?.trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return sanitizeSfuFaultInjectRules(parsed);
}

function trackNamesFromBody(body: Record<string, unknown>): string[] {
  const tracks = body.tracks;
  if (!Array.isArray(tracks)) return [];
  const names: string[] = [];
  for (const track of tracks) {
    if (!track || typeof track !== 'object') continue;
    const trackName = (track as Record<string, unknown>).trackName;
    if (typeof trackName === 'string' && trackName) names.push(trackName);
  }
  return names;
}

// Track entries within a single tracks-new call are homogeneous (all 'local' or all 'remote') —
// the caller either publishes its own tracks or subscribes to a peer's, never both in one call.
function trackLocationsFromBody(body: Record<string, unknown>): string[] {
  const tracks = body.tracks;
  if (!Array.isArray(tracks)) return [];
  const locations: string[] = [];
  for (const track of tracks) {
    if (!track || typeof track !== 'object') continue;
    const location = (track as Record<string, unknown>).location;
    if (typeof location === 'string' && location) locations.push(location);
  }
  return locations;
}

function ruleMatches(
  rule: SfuFaultInjectRule,
  endpoint: SfuFaultInjectEndpoint,
  caller: FaultInjectCaller,
  body: Record<string, unknown>,
): boolean {
  if (rule.endpoint !== endpoint) return false;
  if (rule.matchParticipantId && rule.matchParticipantId !== caller.participantId) return false;
  if (rule.matchTrackName) {
    const trackNames = trackNamesFromBody(body);
    if (!trackNames.includes(rule.matchTrackName)) return false;
  }
  if (rule.matchLocation) {
    const locations = trackLocationsFromBody(body);
    if (!locations.includes(rule.matchLocation)) return false;
  }
  return true;
}

export function matchSfuFaultInject(
  rules: SfuFaultInjectRule[] | null,
  endpoint: SfuFaultInjectEndpoint,
  caller: FaultInjectCaller,
  body: Record<string, unknown>,
): SfuFaultInjectMatch | null {
  if (!rules?.length) return null;
  const rule = rules.find((candidate) => ruleMatches(candidate, endpoint, caller, body));
  return rule ? { rule, endpoint } : null;
}

export function buildSfuFaultInjectResponse(match: SfuFaultInjectMatch): { status: number; body: Record<string, unknown> } {
  const { rule } = match;
  const body: Record<string, unknown> = {
    errorDescription: rule.errorDescription ?? 'sfu-fault-inject',
    status: rule.status,
    endpoint: match.endpoint,
    faultInjected: true,
  };
  if (rule.errorCode) body.errorCode = rule.errorCode;
  return { status: rule.status, body };
}