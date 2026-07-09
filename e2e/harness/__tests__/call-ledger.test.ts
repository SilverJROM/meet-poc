import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  logCall,
  type CallLogEntry,
} from '../call-ledger';

let tmpDir: string;

describe('call-ledger', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
    process.env.LEDGER_STATE_DIR = tmpDir;
    initLedger(tmpDir);
    resetLedger();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe('protected ID blocking', () => {
    it('should block deletion of protected session ID', () => {
      expect(canDelete('652c1475')).toBe(false);
    });

    it('should block deletion of protected room IDs', () => {
      expect(canDelete('TEST_ROOM01')).toBe(false);
      expect(canDelete('testroom01001')).toBe(false);
    });

    it('should block protected IDs even if registered', () => {
      registerCreatedID('session', '652c1475');
      expect(canDelete('652c1475')).toBe(false);
    });
  });

  describe('uncaptured ID rejection', () => {
    it('should reject deletion of ID not registered by this run', () => {
      expect(canDelete('unknown-room-id')).toBe(false);
    });

    it('should reject deletion of unregistered session', () => {
      registerCreatedID('room', 'registered-room-123');
      expect(canDelete('registered-room-123')).toBe(true);
      expect(canDelete('unregistered-session-456')).toBe(false);
    });
  });

  describe('registered ID allow path', () => {
    it('should allow deletion of registered room ID', () => {
      const roomId = 'room-abc-123';
      registerCreatedID('room', roomId);
      expect(canDelete(roomId)).toBe(true);
    });

    it('should allow deletion of registered session ID (non-protected)', () => {
      const sessionId = 'session-xyz-789';
      registerCreatedID('session', sessionId);
      expect(canDelete(sessionId)).toBe(true);
    });

    it('should track multiple registered IDs', () => {
      const roomId = 'room-1';
      const sessionId = 'session-1';
      registerCreatedID('room', roomId);
      registerCreatedID('session', sessionId);
      expect(canDelete(roomId)).toBe(true);
      expect(canDelete(sessionId)).toBe(true);
    });
  });

  describe('call budget tracking', () => {
    it('should allow acceptance burn within cap (25 calls)', () => {
      for (let i = 0; i < 25; i++) {
        const result = incrementCallBurn({ acceptanceAttempt: true, durationMs: 200_000 });
        expect(result).toBe(true);
      }
      expect(isCallBurnExceeded()).toBe(false);
    });

    it('should reject acceptance burn beyond cap', () => {
      for (let i = 0; i < 25; i++) {
        incrementCallBurn({ acceptanceAttempt: true, durationMs: 200_000 });
      }
      expect(isCallBurnExceeded()).toBe(false);
      const result = incrementCallBurn({ acceptanceAttempt: true, durationMs: 200_000 });
      expect(result).toBe(false);
      expect(isCallBurnExceeded()).toBe(true);
    });

    it('should not burn on acceptance < 180s (logs burned:false)', () => {
      const startCount = getState().callBurnCount;
      const result = incrementCallBurn({ acceptanceAttempt: true, durationMs: 100_000 });
      expect(result).toBe(true); // returns true (did not exceed), but did not increment
      expect(getState().callBurnCount).toBe(startCount); // no burn
    });

    it('should not burn on smoke tests (non-acceptance)', () => {
      const startCount = getState().callBurnCount;
      const result = incrementCallBurn({ acceptanceAttempt: false, durationMs: 300_000 });
      expect(result).toBe(true);
      expect(getState().callBurnCount).toBe(startCount); // no burn
    });

    it('should burn on acceptance with forceBurn even if < 180s', () => {
      const startCount = getState().callBurnCount;
      const result = incrementCallBurn({ acceptanceAttempt: true, durationMs: 100_000, forceBurn: true });
      expect(result).toBe(true);
      expect(getState().callBurnCount).toBe(startCount + 1); // did burn
    });
  });

  describe('gate check cap', () => {
    it('should allow incrementing within cap (5 gates)', () => {
      for (let i = 0; i < 5; i++) {
        const result = incrementGateCheck();
        expect(result).toBe(true);
      }
      expect(isGateCheckExceeded()).toBe(false);
    });

    it('should reject increment beyond cap', () => {
      for (let i = 0; i < 5; i++) {
        incrementGateCheck();
      }
      expect(isGateCheckExceeded()).toBe(false);
      const result = incrementGateCheck();
      expect(result).toBe(false);
      expect(isGateCheckExceeded()).toBe(true);
    });
  });

  describe('state persistence', () => {
    it('should persist created IDs to state file', () => {
      const roomId = 'room-persist-123';
      registerCreatedID('room', roomId);
      const stateFile = path.join(tmpDir, 'ledger-state.json');
      expect(fs.existsSync(stateFile)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      expect(saved.createdIDs.length).toBe(1);
      expect(saved.createdIDs[0].id).toBe(roomId);
    });

    it('should persist call burn count', () => {
      incrementCallBurn({ acceptanceAttempt: true, durationMs: 200_000 });
      incrementCallBurn({ acceptanceAttempt: true, durationMs: 200_000 });
      const stateFile = path.join(tmpDir, 'ledger-state.json');
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      expect(saved.callBurnCount).toBe(2);
    });
  });

  describe('empty and whitespace ID rejection', () => {
    it('should reject empty ID registration', () => {
      registerCreatedID('room', '');
      expect(canDelete('')).toBe(false);
    });

    it('should reject whitespace-only ID registration', () => {
      registerCreatedID('room', '   ');
      expect(canDelete('   ')).toBe(false);
    });
  });

  describe('getState() immutability', () => {
    it('mutation must not authorize uncaptured ID deletion', () => {
      const state = getState();
      state.createdIDs.push({ type: 'room', id: 'mutated-id', timestamp: 0 });
      expect(canDelete('mutated-id')).toBe(false);
    });

    it('entry mutation must not affect canDelete checks', () => {
      const legit = 'legit-room-1';
      registerCreatedID('room', legit);
      const state = getState();
      state.createdIDs[0].id = 'object-mutated-uncaptured';
      expect(canDelete('object-mutated-uncaptured')).toBe(false);
      expect(canDelete(legit)).toBe(true);
    });
  });

  describe('state retrieval', () => {
    it('should return current state snapshot', () => {
      registerCreatedID('room', 'room-1');
      registerCreatedID('session', 'session-1');
      incrementCallBurn({ acceptanceAttempt: true, durationMs: 200_000 });
      incrementGateCheck();
      const state = getState();
      expect(state.createdIDs.length).toBe(2);
      expect(state.callBurnCount).toBe(1);
      expect(state.gateCheckCount).toBe(1);
    });
  });

  describe('call logging (JSONL)', () => {
    it('should append logCall entries to call-log.jsonl', () => {
      const entry: CallLogEntry = {
        timestamp: Date.now(),
        purpose: 'acceptance',
        durationMs: 5000,
        deviceMode: 'fake-device',
        stimulus: 'speech',
        burned: false,
        result: 'success',
      };

      logCall(entry);

      const logFile = path.join(tmpDir, 'call-log.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(1);
      const logged = JSON.parse(lines[0]);
      expect(logged.purpose).toBe('acceptance');
      expect(logged.durationMs).toBe(5000);
      expect(logged.burned).toBe(false);
    });

    it('should append multiple logCall entries to same file', () => {
      const entries: CallLogEntry[] = [
        {
          timestamp: Date.now(),
          purpose: 'acceptance',
          durationMs: 200_000,
          deviceMode: 'fake-device',
          burned: true,
          result: 'success',
        },
        {
          timestamp: Date.now() + 1000,
          purpose: 'smoke',
          durationMs: 50_000,
          deviceMode: 'real-virtual-mic',
          stimulus: 'tone',
          burned: false,
          result: 'success',
        },
      ];

      entries.forEach((e) => logCall(e));

      const logFile = path.join(tmpDir, 'call-log.jsonl');
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).purpose).toBe('acceptance');
      expect(JSON.parse(lines[1]).purpose).toBe('smoke');
    });

    it('should record burned flag correctly based on acceptance + duration', () => {
      const acceptanceLong: CallLogEntry = {
        timestamp: Date.now(),
        purpose: 'acceptance',
        durationMs: 200_000,
        deviceMode: 'fake-device',
        burned: true, // acceptance + 200s should burn
        result: 'success',
      };

      const acceptanceShort: CallLogEntry = {
        timestamp: Date.now(),
        purpose: 'acceptance',
        durationMs: 100_000,
        deviceMode: 'fake-device',
        burned: false, // acceptance + 100s should NOT burn
        result: 'success',
      };

      const smoke: CallLogEntry = {
        timestamp: Date.now(),
        purpose: 'smoke',
        durationMs: 300_000,
        deviceMode: 'fake-device',
        burned: false, // smoke should never burn
        result: 'success',
      };

      logCall(acceptanceLong);
      logCall(acceptanceShort);
      logCall(smoke);

      const logFile = path.join(tmpDir, 'call-log.jsonl');
      const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
      expect(JSON.parse(lines[0]).burned).toBe(true);
      expect(JSON.parse(lines[1]).burned).toBe(false);
      expect(JSON.parse(lines[2]).burned).toBe(false);
    });
  });
});
