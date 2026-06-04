import type { PeerState } from '../../services/peer-state';
import type { ParticipantSnapshot } from '../../services/recorder.service';

export type RoomRecordingSyncRecorder = {
  addPeerStream(clientId: string, stream: MediaStream | null): void;
  recordedClientIds(): string[];
  removePeerStream(clientId: string): void;
};

export type RoomRecordingResumeRecorder = {
  notifyParticipantLeft(clientId: string): void;
  notifyParticipantJoined(participant: ParticipantSnapshot): void;
};

export function syncRecorderPeerStreams(peers: PeerState[], recorder: RoomRecordingSyncRecorder): void {
  const activePeerIds = new Set<string>();
  for (const peer of peers) {
    if (peer.isLocal) continue;
    activePeerIds.add(peer.id);
    recorder.addPeerStream(peer.id, peer.stream);
  }
  const recordedIds = recorder.recordedClientIds();
  for (const clientId of recordedIds) {
    if (clientId !== 'local' && !activePeerIds.has(clientId)) recorder.removePeerStream(clientId);
  }
}

export function recordPeerResumed(
  recorder: RoomRecordingResumeRecorder,
  oldClientId: string,
  participant: ParticipantSnapshot,
): void {
  recorder.notifyParticipantLeft(oldClientId);
  recorder.notifyParticipantJoined(participant);
}
