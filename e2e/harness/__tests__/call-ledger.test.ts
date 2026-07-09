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
    it('should allow incrementing within cap (25 calls)', () => {
      for (let i = 0; i < 25; i++) {
        const result = incrementCallBurn();
        expect(result).toBe(true);
      }
      expect(isCallBurnExceeded()).toBe(false);
    });

    it('should reject increment beyond cap', () => {
      for (let i = 0; i < 25; i++) {
        incrementCallBurn();
      }
      expect(isCallBurnExceeded()).toBe(false);
      const result = incrementCallBurn();
      expect(result).toBe(false);
      expect(isCallBurnExceeded()).toBe(true);
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
      incrementCallBurn();
      incrementCallBurn();
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
      incrementCallBurn();
      incrementGateCheck();
      const state = getState();
      expect(state.createdIDs.length).toBe(2);
      expect(state.callBurnCount).toBe(1);
      expect(state.gateCheckCount).toBe(1);
    });
  });
});
