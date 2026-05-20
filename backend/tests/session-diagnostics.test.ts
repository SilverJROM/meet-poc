import request from 'supertest';
import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom } from '../src/modules/rooms/store.js';
import { appendDiagnosticsEntry, getDiagnosticsForSession, openSession } from '../src/modules/sessions/store.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';

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
    const session = openSession(room.id, 'jrom@silverjrom.app', db);
    const app = createApp(db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const otherCookie = `session=${createSession('other@silverjrom.app', db)}`;

    await request(app).post(`/api/meeting-sessions/${session.id}/diagnostics`).send(samplePayload()).expect(401);
    await request(app)
      .post(`/api/meeting-sessions/${session.id}/diagnostics`)
      .set('Cookie', otherCookie)
      .send(samplePayload())
      .expect(404);

    const created = await request(app)
      .post(`/api/meeting-sessions/${session.id}/diagnostics`)
      .set('Cookie', ownerCookie)
      .send(samplePayload())
      .expect(200);
    expect(created.body.entry).toMatchObject({
      sessionId: session.id,
      kind: 'sample',
      relayUsed: true,
      candidateTypes: ['relay'],
      peerCount: 1,
    });

    const list = await request(app).get('/api/meeting-sessions/diagnostics-log').set('Cookie', ownerCookie).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.sessions[0]).toMatchObject({
      id: session.id,
      roomTitle: 'Diagnostics room',
      diagnosticCount: 1,
      relayUsed: true,
      candidateTypes: ['relay'],
    });

    const detail = await request(app).get(`/api/meeting-sessions/${session.id}/diagnostics`).set('Cookie', ownerCookie).expect(200);
    expect(detail.body.entries[0].payload.peers[0].outboundAudio).toMatchObject({
      deviceId: 'external-mic-1',
      label: 'External USB Microphone',
      enabled: true,
      muted: false,
      readyState: 'live',
      source: 'sender',
    });
    await request(app).get(`/api/meeting-sessions/${session.id}/diagnostics`).set('Cookie', otherCookie).expect(404);
    await request(app).get(`/api/meeting-sessions/${session.id}/diagnostics.json`).set('Cookie', ownerCookie).expect(200);
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
