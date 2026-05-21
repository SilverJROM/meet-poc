import request from 'supertest';
import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import { appendDiagnosticsEntry, getDiagnosticsForSession, openSession } from '../src/modules/sessions/store.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';
import { closeServer, closeWs, connectWs, nextMessage, startWsServer } from './signaling-helpers.js';

const MAX_DIAGNOSTIC_ENTRIES_PER_SESSION = 720;

function insertUser(db: Database.Database, email: string): void {
  db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    email,
    '00:00',
    Date.now(),
    Date.now(),
  );
}

function samplePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'sample',
    roomId: 'room',
    roomTitle: 'Diagnostics room',
    clientId: 'owner-client',
    participantId: 'owner-participant',
    clientKey: 'owner-key',
    clientName: 'Owner',
    createdAt: Date.now(),
    wsStatus: 'connected',
    wsReconnectAttempts: 0,
    forceRelay: false,
    manualAudioOnly: false,
    peers: [
      {
        id: 'guest-client',
        name: 'Guest',
        isLocal: false,
        isHost: false,
        connectionState: 'connected',
        iceConnectionState: 'connected',
        iceGatheringState: 'complete',
        signalingState: 'stable',
        selectedCandidateType: 'relay',
        relayUsed: true,
        quality: 'good',
        packetLossPct: 0,
        jitterMs: 4,
        rttMs: 35,
        availableOutgoingBitrateKbps: 1200,
        audioOnlyReason: null,
        micEnabled: true,
        camEnabled: true,
        screenOn: false,
        outboundAudio: {
          id: 'audio-track',
          kind: 'audio',
          deviceId: 'external-mic-1',
          label: 'External USB Microphone',
          enabled: true,
          muted: false,
          readyState: 'live',
          source: 'sender',
        },
        inboundAudio: {
          packetsReceived: 42,
          packetsLost: 0,
          bytesReceived: 12_345,
          audioLevel: 0.08,
          packetsReceivedDelta: 8,
          packetsActivelyArriving: true,
          trackReadyState: 'live',
          trackMuted: false,
        },
        outboundVideo: {
          id: 'video-track',
          kind: 'video',
          deviceId: 'camera-1',
          label: 'FaceTime Camera',
          enabled: true,
          muted: false,
          readyState: 'live',
          source: 'sender',
        },
        updatedAt: Date.now(),
      },
    ],
    ...overrides,
  };
}

describe('meeting session diagnostics API', () => {
  it('DR-28 persists owner-gated diagnostics with active sender track evidence', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    const room = createRoom('Diagnostics room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const otherCookie = `session=${createSession('other@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', clientKey: 'owner-key' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .set('Cookie', otherCookie)
      .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId }))
      .expect(403);
    await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .send(samplePayload({ clientId: 'never-admitted', participantId: 'never-participant', clientKey: 'never-key' }))
      .expect(403);

    const created = await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .set('Cookie', ownerCookie)
      .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId }))
      .expect(200);
    expect(created.body.entry).toMatchObject({
      sessionId,
      kind: 'sample',
      relayUsed: true,
      candidateTypes: ['relay'],
      peerCount: 1,
    });

    const list = await request(server).get('/api/meeting-sessions/diagnostics-log').set('Cookie', ownerCookie).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.sessions[0]).toMatchObject({
      id: sessionId,
      roomTitle: 'Diagnostics room',
      diagnosticCount: 1,
      relayUsed: true,
      candidateTypes: ['relay'],
    });

    const detail = await request(server).get(`/api/meeting-sessions/${sessionId}/diagnostics`).set('Cookie', ownerCookie).expect(200);
    expect(detail.body.entries[0].payload.peers[0].outboundAudio).toMatchObject({
      deviceId: 'external-mic-1',
      label: 'External USB Microphone',
      enabled: true,
      muted: false,
      readyState: 'live',
      source: 'sender',
    });
    expect(detail.body.entries[0].payload.peers[0].inboundAudio).toMatchObject({
      packetsReceived: 42,
      packetsReceivedDelta: 8,
      packetsActivelyArriving: true,
      trackReadyState: 'live',
      trackMuted: false,
    });
    await request(server).get(`/api/meeting-sessions/${sessionId}/diagnostics`).set('Cookie', otherCookie).expect(404);
    await request(server).get(`/api/meeting-sessions/${sessionId}/diagnostics.json`).set('Cookie', ownerCookie).expect(200);
    closeWs(owner);
    await closeServer(server);
  });

  it('DR-41 accepts diagnostics from admitted guests and rejects never-admitted clients', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Guest diagnostics', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);
    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', clientKey: 'owner-key-dr41' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', clientKey: 'guest-key-dr41' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: String(knocking.clientId) }));
    const guestAdmitted = await nextMessage(guest, (msg) => msg.type === 'admitted');

    await request(server)
      .post(`/api/meeting-sessions/${ownerAdmitted.sessionId}/diagnostics`)
      .send(samplePayload({ clientId: guestAdmitted.clientId, participantId: guestAdmitted.participantId, clientKey: 'guest-key-dr41', clientName: 'Guest' }))
      .expect(200);
    await request(server)
      .post(`/api/meeting-sessions/${ownerAdmitted.sessionId}/diagnostics`)
      .send(samplePayload({ clientId: String(knocking.clientId), participantId: guestAdmitted.participantId, clientKey: 'wrong-key', clientName: 'Guest' }))
      .expect(403);

    const detail = await request(server).get(`/api/meeting-sessions/${ownerAdmitted.sessionId}/diagnostics`).set('Cookie', ownerCookie).expect(200);
    expect(detail.body.entries).toHaveLength(1);
    expect(detail.body.entries[0].payload.clientName).toBe('Guest');

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });

  it('DR-28 retains a bounded number of diagnostics entries per session', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Bounded diagnostics', 'jrom@silverjrom.app', db);
    const session = openSession(room.id, 'jrom@silverjrom.app', db);

    for (let i = 0; i < MAX_DIAGNOSTIC_ENTRIES_PER_SESSION + 5; i += 1) {
      const entry = appendDiagnosticsEntry(
        session.id,
        'jrom@silverjrom.app',
        samplePayload({ kind: i % 2 === 0 ? 'sample' : 'state-change', sequence: i }),
        db,
      );
      expect(entry).not.toBeNull();
    }

    const detail = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db);
    expect(detail?.entries).toHaveLength(MAX_DIAGNOSTIC_ENTRIES_PER_SESSION);
    expect(detail?.entries[0].payload.sequence).toBe(5);
  });
});
