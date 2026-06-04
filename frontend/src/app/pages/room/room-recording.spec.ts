import assert from 'node:assert/strict';
import { recordPeerResumed, syncRecorderPeerStreams } from './room-recording.js';
import type { ParticipantSnapshot } from '../../services/recorder.service.js';
import type { PeerState } from '../../services/peer-state.js';

function fakeAudioStream(label: string): MediaStream {
  return {
    id: label,
    getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }],
    getTracks: () => [{ kind: 'audio', readyState: 'live' }],
  } as unknown as MediaStream;
}

function fakePeer(id: string, stream: MediaStream | null, isLocal = false): PeerState {
  return {
    id,
    participantId: id,
    stream,
    pc: null,
    name: id,
    connectionState: stream ? 'connected' : 'connecting',
    iceConnectionState: 'connected',
    iceGatheringState: 'complete',
    signalingState: 'stable',
    selectedCandidateType: null,
    quality: 'good',
    packetLossPct: null,
    jitterMs: null,
    rttMs: null,
    availableOutgoingBitrateKbps: null,
    audioOnlyReason: null,
    updatedAt: Date.now(),
    isLocal,
    isHost: isLocal,
    micEnabled: true,
    camEnabled: false,
    screenOn: false,
    reconnecting: false,
    reconnectingSince: null,
    isMobile: false,
  };
}

// REC3 — peer-resumed evicts the old recorder id, records the new participant, and new stream capture follows.
{
  const events: string[] = [];
  const tracked = new Set(['local', 'old-client']);
  const joined: ParticipantSnapshot[] = [];
  const recorder = {
    addPeerStream: (clientId: string, stream: MediaStream | null) => {
      events.push(`add:${clientId}:${stream?.id ?? 'none'}`);
      if (stream) tracked.add(clientId);
    },
    recordedClientIds: () => [...tracked],
    removePeerStream: (clientId: string) => {
      events.push(`remove:${clientId}`);
      tracked.delete(clientId);
    },
    notifyParticipantLeft: (clientId: string) => {
      events.push(`left:${clientId}`);
      tracked.delete(clientId);
    },
    notifyParticipantJoined: (participant: ParticipantSnapshot) => {
      events.push(`joined:${participant.clientId}`);
      joined.push(participant);
    },
  };

  recordPeerResumed(recorder, 'old-client', { clientId: 'new-client', displayName: 'Riley', isHost: false });
  syncRecorderPeerStreams([fakePeer('new-client', fakeAudioStream('new-stream'))], recorder);

  assert.deepEqual(
    events,
    ['left:old-client', 'joined:new-client', 'add:new-client:new-stream'],
    'old recorder id is evicted before the resumed participant is joined and captured under the new id',
  );
  assert.deepEqual([...tracked].sort(), ['local', 'new-client'], 'no orphaned old source remains after resumed peer capture');
  assert.deepEqual(joined, [{ clientId: 'new-client', displayName: 'Riley', isHost: false }], 'new participant metadata is retained');
}

console.log('room-recording: all assertions passed');
