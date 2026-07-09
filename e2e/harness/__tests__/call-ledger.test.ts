import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  initLedger,
  registerCreatedID,
  canDelete,
  incrementCallBurn,
  isCallBurnExceeded,
  incrementGateCheck,
  isGateCheckExceeded,
  getState,
  resetLedger,
} from '../call-ledger';

interface TestResult {
  passed: number;
  failed: number;
  tests: Array<{ name: string; error?: string }>;
}

const results: TestResult = { passed: 0, failed: 0, tests: [] };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.passed++;
    results.tests.push({ name });
  } catch (error) {
    results.failed++;
    results.tests.push({ name, error: String(error) });
  }
}

// Setup
let tmpDir: string;

function beforeEach(): void {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  process.env.LEDGER_STATE_DIR = tmpDir;
  initLedger(tmpDir);
  resetLedger();
}

function afterEach(): void {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
}

// Tests: protected ID blocking
test('protected ID: should block deletion of protected session ID', () => {
  beforeEach();
  try {
    assert(canDelete('652c1475') === false, 'protected session 652c1475 must not be deletable');
  } finally {
    afterEach();
  }
});

test('protected ID: should block deletion of protected room IDs', () => {
  beforeEach();
  try {
    assert(canDelete('TEST_ROOM01') === false, 'protected room TEST_ROOM01 must not be deletable');
    assert(
      canDelete('testroom01001') === false,
      'protected room testroom01001 must not be deletable'
    );
  } finally {
    afterEach();
  }
});

test('protected ID: should block protected IDs even if registered', () => {
  beforeEach();
  try {
    registerCreatedID('session', '652c1475');
    assert(
      canDelete('652c1475') === false,
      'protected session must not be deletable even when registered'
    );
  } finally {
    afterEach();
  }
});

// Tests: uncaptured ID rejection
test('uncaptured: should reject deletion of ID not registered by this run', () => {
  beforeEach();
  try {
    assert(
      canDelete('unknown-room-id') === false,
      'unregistered ID unknown-room-id must not be deletable'
    );
  } finally {
    afterEach();
  }
});

test('uncaptured: should reject deletion of unregistered session', () => {
  beforeEach();
  try {
    registerCreatedID('room', 'registered-room-123');
    assert(
      canDelete('registered-room-123') === true,
      'registered room should be deletable'
    );
    assert(
      canDelete('unregistered-session-456') === false,
      'unregistered session must not be deletable'
    );
  } finally {
    afterEach();
  }
});

// Tests: registered ID allow path
test('registered: should allow deletion of registered room ID', () => {
  beforeEach();
  try {
    const roomId = 'room-abc-123';
    registerCreatedID('room', roomId);
    assert(canDelete(roomId) === true, 'registered room ID should be deletable');
  } finally {
    afterEach();
  }
});

test('registered: should allow deletion of registered session ID (non-protected)', () => {
  beforeEach();
  try {
    const sessionId = 'session-xyz-789';
    registerCreatedID('session', sessionId);
    assert(canDelete(sessionId) === true, 'registered session ID should be deletable');
  } finally {
    afterEach();
  }
});

test('registered: should track multiple registered IDs', () => {
  beforeEach();
  try {
    const roomId = 'room-1';
    const sessionId = 'session-1';
    registerCreatedID('room', roomId);
    registerCreatedID('session', sessionId);
    assert(canDelete(roomId) === true, 'room-1 should be deletable');
    assert(canDelete(sessionId) === true, 'session-1 should be deletable');
  } finally {
    afterEach();
  }
});

// Tests: call budget tracking
test('budget: should allow incrementing within cap (25 calls)', () => {
  beforeEach();
  try {
    let result: boolean;
    for (let i = 0; i < 25; i++) {
      result = incrementCallBurn();
      assert(result === true, `call burn ${i + 1} should succeed within cap`);
    }
    assert(!isCallBurnExceeded(), 'call burn should not exceed at 25');
  } finally {
    afterEach();
  }
});

test('budget: should reject increment beyond cap', () => {
  beforeEach();
  try {
    for (let i = 0; i < 25; i++) {
      incrementCallBurn();
    }
    assert(!isCallBurnExceeded(), 'should not exceed at 25');
    const result = incrementCallBurn();
    assert(result === false, 'increment beyond cap should return false');
    assert(isCallBurnExceeded(), 'should exceed after 26th call');
  } finally {
    afterEach();
  }
});

// Tests: gate check cap
test('gate: should allow incrementing within cap (5 gates)', () => {
  beforeEach();
  try {
    for (let i = 0; i < 5; i++) {
      const result = incrementGateCheck();
      assert(result === true, `gate check ${i + 1} should succeed within cap`);
    }
    assert(!isGateCheckExceeded(), 'gate check should not exceed at 5');
  } finally {
    afterEach();
  }
});

test('gate: should reject increment beyond cap', () => {
  beforeEach();
  try {
    for (let i = 0; i < 5; i++) {
      incrementGateCheck();
    }
    assert(!isGateCheckExceeded(), 'should not exceed at 5');
    const result = incrementGateCheck();
    assert(result === false, 'increment beyond cap should return false');
    assert(isGateCheckExceeded(), 'should exceed after 6th gate');
  } finally {
    afterEach();
  }
});

// Tests: state persistence
test('persistence: should persist created IDs to state file', () => {
  beforeEach();
  try {
    const roomId = 'room-persist-123';
    registerCreatedID('room', roomId);
    const stateFile = path.join(tmpDir, 'ledger-state.json');
    assert(fs.existsSync(stateFile), 'state file should exist');
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert(saved.createdIDs.length === 1, 'should have 1 created ID');
    assert(saved.createdIDs[0].id === roomId, 'ID should match');
  } finally {
    afterEach();
  }
});

test('persistence: should persist call burn count', () => {
  beforeEach();
  try {
    incrementCallBurn();
    incrementCallBurn();
    const stateFile = path.join(tmpDir, 'ledger-state.json');
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert(saved.callBurnCount === 2, 'call burn count should be 2');
  } finally {
    afterEach();
  }
});

// Tests: empty and whitespace ID rejection
test('empty/whitespace: should reject empty ID registration', () => {
  beforeEach();
  try {
    registerCreatedID('room', '');
    assert(canDelete('') === false, 'empty ID must not be deletable');
  } finally {
    afterEach();
  }
});

test('empty/whitespace: should reject whitespace-only ID registration', () => {
  beforeEach();
  try {
    registerCreatedID('room', '   ');
    assert(canDelete('   ') === false, 'whitespace-only ID must not be deletable');
  } finally {
    afterEach();
  }
});

// Tests: getState() immutability
test('immutability: getState() mutation must not authorize uncaptured ID deletion', () => {
  beforeEach();
  try {
    const state = getState();
    state.createdIDs.push({ type: 'room', id: 'mutated-id', timestamp: 0 });
    assert(
      canDelete('mutated-id') === false,
      'mutated ID inserted via getState() must not be deletable'
    );
  } finally {
    afterEach();
  }
});

test('immutability: getState() entry mutation must not affect canDelete checks', () => {
  beforeEach();
  try {
    const legit = 'legit-room-1';
    registerCreatedID('room', legit);
    const state = getState();
    state.createdIDs[0].id = 'object-mutated-uncaptured';
    assert(
      canDelete('object-mutated-uncaptured') === false,
      'mutated ID via returned entry must not be deletable'
    );
    assert(
      canDelete(legit) === true,
      'original registered ID must still be deletable'
    );
  } finally {
    afterEach();
  }
});

// Tests: state retrieval
test('state: should return current state snapshot', () => {
  beforeEach();
  try {
    registerCreatedID('room', 'room-1');
    registerCreatedID('session', 'session-1');
    incrementCallBurn();
    incrementGateCheck();
    const state = getState();
    assert(state.createdIDs.length === 2, 'should have 2 created IDs');
    assert(state.callBurnCount === 1, 'call burn count should be 1');
    assert(state.gateCheckCount === 1, 'gate check count should be 1');
  } finally {
    afterEach();
  }
});

// Report results when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n=== Call-Ledger Test Results ===');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  results.tests.forEach((t) => {
    if (t.error) {
      console.log(`✗ ${t.name}`);
      console.log(`  ${t.error}`);
    } else {
      console.log(`✓ ${t.name}`);
    }
  });

  console.log(`\nTotal: ${results.passed + results.failed} tests`);
  process.exit(results.failed > 0 ? 1 : 0);
}

export { results };
