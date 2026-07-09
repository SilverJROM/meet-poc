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

// Hard-blocked protected IDs — never deletable
const PROTECTED_IDS = new Set<string>([
  '652c1475', // session
  'TEST_ROOM01', // room
  'testroom01001', // room
]);

const DEFAULT_CALL_BURN_CAP = 25;
const DEFAULT_GATE_CHECK_CAP = 5;

let ledgerPath: string | null = null;
let currentState: LedgerState = {
  createdIDs: [],
  callBurnCount: 0,
  gateCheckCount: 0,
};

export function initLedger(basePath?: string): void {
  const stateDir = basePath || process.env.LEDGER_STATE_DIR || process.cwd();
  ledgerPath = path.join(stateDir, 'ledger-state.json');
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
  currentState.createdIDs.push({
    type,
    id,
    timestamp: Date.now(),
  });
  saveState();
}

export function canDelete(id: string): boolean {
  // Hard-block protected IDs
  if (PROTECTED_IDS.has(id)) {
    return false;
  }

  // Only allow deletion of IDs registered by this run
  return currentState.createdIDs.some((entry) => entry.id === id);
}

export function incrementCallBurn(): boolean {
  currentState.callBurnCount += 1;
  saveState();
  return currentState.callBurnCount <= DEFAULT_CALL_BURN_CAP;
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
  return { ...currentState };
}

export function resetLedger(): void {
  currentState = {
    createdIDs: [],
    callBurnCount: 0,
    gateCheckCount: 0,
  };
  saveState();
}
