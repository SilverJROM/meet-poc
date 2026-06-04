import assert from 'node:assert/strict';
import { decideRoomLifecycleLeave } from './room-lifecycle';

assert.strictEqual(
  decideRoomLifecycleLeave({
    eventType: 'pagehide',
    persisted: true,
    visibilityState: 'hidden',
    mobileBackgroundPauseEnabled: false,
  }),
  'pause',
  'persisted pagehide pauses for BFCache instead of cleaning up',
);

assert.strictEqual(
  decideRoomLifecycleLeave({
    eventType: 'pagehide',
    persisted: false,
    visibilityState: 'hidden',
    mobileBackgroundPauseEnabled: true,
  }),
  'pause',
  'mobile hidden pagehide pauses for app backgrounding instead of cleaning up',
);

assert.strictEqual(
  decideRoomLifecycleLeave({
    eventType: 'beforeunload',
    persisted: false,
    visibilityState: 'visible',
    mobileBackgroundPauseEnabled: true,
  }),
  'cleanup',
  'beforeunload remains a real unload and fully cleans up',
);

assert.strictEqual(
  decideRoomLifecycleLeave({
    eventType: 'pagehide',
    persisted: false,
    visibilityState: 'visible',
    mobileBackgroundPauseEnabled: false,
  }),
  'cleanup',
  'desktop non-persisted pagehide remains a real unload and fully cleans up',
);

console.log('room-lifecycle: all assertions passed');
