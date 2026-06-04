export type RoomLifecycleLeaveAction = 'cleanup' | 'pause';

export interface RoomLifecycleLeaveDecisionInput {
  eventType: 'beforeunload' | 'pagehide';
  persisted: boolean;
  visibilityState: DocumentVisibilityState;
  mobileBackgroundPauseEnabled: boolean;
}

export function decideRoomLifecycleLeave(input: RoomLifecycleLeaveDecisionInput): RoomLifecycleLeaveAction {
  if (input.eventType === 'beforeunload') return 'cleanup';
  if (input.persisted) return 'pause';
  if (input.mobileBackgroundPauseEnabled && input.visibilityState === 'hidden') return 'pause';
  return 'cleanup';
}
