import * as fs from 'fs';
import * as path from 'path';

export type CreatedIDType = 'room' | 'session';

export interface LedgerEntry {
  type: CreatedIDType;
  id: string;
  timestamp: number;
}

export interface LedgerState {
  createdIDs: LedgerEntry[];
  callBurnCount: number;
  gateCheckCount: number;
}

export interface CallLogEntry {
  timestamp: number;
  purpose?: string;
  durationMs: number;
  deviceMode: string;
  stimulus?: string;
  burned: boolean;
  result?: 'success' | 'failed';
}

// Hard-blocked protected IDs — never deletable
const PROTECTED_IDS = new Set<string>([
  '652c1475', // session
  'TEST_ROOM01', // room
  'testroom01001', // room
]);

const DEFAULT_CALL_BURN_CAP = 50;
const DEFAULT_GATE_CHECK_CAP = 5;

let ledgerPath: string | null = null;
let logPath: string | null = null;
let currentState: LedgerState = {
  createdIDs: [],
  callBurnCount: 0,
  gateCheckCount: 0,
};

export function initLedger(basePath?: string): void {
  const stateDir = basePath || process.env.LEDGER_STATE_DIR || process.cwd();
  ledgerPath = path.join(stateDir, 'ledger-state.json');
  logPath = path.join(stateDir, 'call-log.jsonl');
  loadState();
}

function loadState(): void {
  if (!ledgerPath) return;
  try {
    if (fs.existsSync(ledgerPath)) {
      const data = fs.readFileSync(ledgerPath, 'utf-8');
      currentState = JSON.parse(data);
    }
  } catch (err) {
    currentState = {
      createdIDs: [],
      callBurnCount: 0,
      gateCheckCount: 0,
    };
  }
}

function saveState(): void {
  if (!ledgerPath) return;
  fs.writeFileSync(ledgerPath, JSON.stringify(currentState, null, 2), 'utf-8');
}

export function registerCreatedID(type: CreatedIDType, id: string): void {
  // Reject empty or whitespace-only IDs
  if (!id || !id.trim()) {
    return;
  }
  currentState.createdIDs.push({
    type,
    id,
    timestamp: Date.now(),
  });
  saveState();
}

export function canDelete(id: string): boolean {
  // Reject empty or whitespace-only IDs
  if (!id || !id.trim()) {
    return false;
  }

  // Hard-block protected IDs
  if (PROTECTED_IDS.has(id)) {
    return false;
  }

  // Only allow deletion of IDs registered by this run
  return currentState.createdIDs.some((entry) => entry.id === id);
}

export interface IncrementCallBurnOptions {
  acceptanceAttempt: boolean;
  durationMs: number;
  forceBurn?: boolean;
}

export function incrementCallBurn(options: IncrementCallBurnOptions): boolean {
  const shouldBurn = options.acceptanceAttempt && (options.durationMs >= 180_000 || options.forceBurn);
  if (!shouldBurn) {
    return true;
  }
  currentState.callBurnCount += 1;
  saveState();
  return currentState.callBurnCount <= DEFAULT_CALL_BURN_CAP;
}

export function logCall(entry: CallLogEntry): void {
  if (!logPath) return;
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');
}

export function isCallBurnExceeded(): boolean {
  return currentState.callBurnCount > DEFAULT_CALL_BURN_CAP;
}

export function incrementGateCheck(): boolean {
  currentState.gateCheckCount += 1;
  saveState();
  return currentState.gateCheckCount <= DEFAULT_GATE_CHECK_CAP;
}

export function isGateCheckExceeded(): boolean {
  return currentState.gateCheckCount > DEFAULT_GATE_CHECK_CAP;
}

export function getState(): LedgerState {
  return {
    createdIDs: currentState.createdIDs.map((e) => ({ ...e })),
    callBurnCount: currentState.callBurnCount,
    gateCheckCount: currentState.gateCheckCount,
  };
}

export function resetLedger(): void {
  currentState = {
    createdIDs: [],
    callBurnCount: 0,
    gateCheckCount: 0,
  };
  saveState();
}
