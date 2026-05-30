import request from 'supertest';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { createRoom, setRoomAccess } from '../src/modules/rooms/store.js';
import {
  appendDiagnosticsEntry,
  getDiagnosticsForSession,
  getSessionParticipants,
  openSession,
} from '../src/modules/sessions/store.js';
import { runMigrations } from '../src/db.js';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('P-1 migration 0013 adds three nullable columns + index; applies exactly once', () => {
    const db = createTestDb();

    const cols = db
      .prepare('PRAGMA table_info(meeting_session_diagnostics)')
      .all() as Array<{ name: string; type: string; notnull: number; dflt_value: unknown }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('participant_id');
    expect(colNames).toContain('participant_name');
    expect(colNames).toContain('participant_client_key');

    const participantIdCol = cols.find((c) => c.name === 'participant_id')!;
    expect(participantIdCol.type).toBe('TEXT');
    expect(participantIdCol.notnull).toBe(0);
    expect(participantIdCol.dflt_value).toBeNull();

    const indexes = db
      .prepare('PRAGMA index_list(meeting_session_diagnostics)')
      .all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_meeting_session_diagnostics_session_participant');

    const idxCols = db
      .prepare("PRAGMA index_info('idx_meeting_session_diagnostics_session_participant')")
      .all() as Array<{ name: string }>;
    expect(idxCols.map((c) => c.name)).toEqual(['session_id', 'participant_id']);

    const migCount = db
      .prepare("SELECT COUNT(*) AS c FROM _migrations WHERE name = '0013_diagnostics_participant_attribution.sql'")
      .get() as { c: number };
    expect(migCount.c).toBe(1);
    runMigrations(db);
    const migCountAfter = db
      .prepare("SELECT COUNT(*) AS c FROM _migrations WHERE name = '0013_diagnostics_participant_attribution.sql'")
      .get() as { c: number };
    expect(migCountAfter.c).toBe(1);
  });

  it('P-2 appendDiagnosticsEntry populates attribution columns from payload', () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Attribution room', 'jrom@silverjrom.app', db);
    const session = openSession(room.id, 'jrom@silverjrom.app', db);

    const entry = appendDiagnosticsEntry(session.id, null, samplePayload(), db)!;
    expect(entry).not.toBeNull();
    const row = db
      .prepare('SELECT participant_id, participant_name, participant_client_key FROM meeting_session_diagnostics WHERE id = ?')
      .get(entry.id) as { participant_id: string; participant_name: string; participant_client_key: string };
    expect(row.participant_id).toBe('owner-participant');
    expect(row.participant_name).toBe('Owner');
    expect(row.participant_client_key).toBe('owner-key');
  });

  it('P-3 missing identity fields insert NULL; no error', () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Null attribution room', 'jrom@silverjrom.app', db);
    const session = openSession(room.id, 'jrom@silverjrom.app', db);

    const minimalPayload = { kind: 'sample', roomId: 'room', clientId: 'x', createdAt: Date.now() };
    const entry = appendDiagnosticsEntry(session.id, null, minimalPayload, db)!;
    expect(entry).not.toBeNull();
    const row = db
      .prepare('SELECT participant_id, participant_name, participant_client_key FROM meeting_session_diagnostics WHERE id = ?')
      .get(entry.id) as { participant_id: string | null; participant_name: string | null; participant_client_key: string | null };
    expect(row.participant_id).toBeNull();
    expect(row.participant_name).toBeNull();
    expect(row.participant_client_key).toBeNull();

    // Empty-string identity fields are trimmed to NULL.
    const emptyEntry = appendDiagnosticsEntry(
      session.id,
      null,
      samplePayload({ participantId: '', clientName: '', clientKey: '' }),
      db,
    )!;
    expect(emptyEntry).not.toBeNull();
    const emptyRow = db
      .prepare('SELECT participant_id, participant_name, participant_client_key FROM meeting_session_diagnostics WHERE id = ?')
      .get(emptyEntry.id) as { participant_id: string | null; participant_name: string | null; participant_client_key: string | null };
    expect(emptyRow.participant_id).toBeNull();
    expect(emptyRow.participant_name).toBeNull();
    expect(emptyRow.participant_client_key).toBeNull();
  });

  it('P-4 getDiagnosticsForSession exposes participantId + participantName', () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Expose attribution room', 'jrom@silverjrom.app', db);
    const session = openSession(room.id, 'jrom@silverjrom.app', db);

    appendDiagnosticsEntry(session.id, null, samplePayload(), db);
    appendDiagnosticsEntry(session.id, null, { kind: 'sample', roomId: 'room', clientId: 'x', createdAt: Date.now() }, db);

    const result = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db)!;
    expect(result.entries[0].participantId).toBe('owner-participant');
    expect(result.entries[0].participantName).toBe('Owner');
    expect(result.entries[1].participantId).toBeNull();
    expect(result.entries[1].participantName).toBeNull();
  });

  it('P-5 getDiagnosticsForSession optional participantId filter', () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Filter room', 'jrom@silverjrom.app', db);
    const session = openSession(room.id, 'jrom@silverjrom.app', db);

    for (let i = 0; i < 3; i += 1) {
      appendDiagnosticsEntry(session.id, null, samplePayload({ participantId: 'owner-participant', clientName: 'Owner' }), db);
    }
    for (let i = 0; i < 2; i += 1) {
      appendDiagnosticsEntry(session.id, null, samplePayload({ participantId: 'guest-participant', clientName: 'Guest' }), db);
    }

    const all = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db)!;
    expect(all.entries).toHaveLength(5);

    const ownerOnly = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db, 'owner-participant')!;
    expect(ownerOnly.entries).toHaveLength(3);
    expect(ownerOnly.entries.every((e) => e.participantId === 'owner-participant')).toBe(true);
    expect(ownerOnly.session).toBeDefined();

    const guestOnly = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db, 'guest-participant')!;
    expect(guestOnly.entries).toHaveLength(2);
    expect(guestOnly.entries.every((e) => e.participantId === 'guest-participant')).toBe(true);

    const none = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db, 'nonexistent-participant')!;
    expect(none).not.toBeNull();
    expect(none.entries).toHaveLength(0);

    // null behaves identically to omitted.
    const nullFilter = getDiagnosticsForSession('jrom@silverjrom.app', session.id, db, null)!;
    expect(nullFilter.entries).toHaveLength(5);
  });

  it('P-6 getSessionParticipants returns distinct participants with sample counts', () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    const room = createRoom('Participants room', 'jrom@silverjrom.app', db);
    const session = openSession(room.id, 'jrom@silverjrom.app', db);

    for (let i = 0; i < 3; i += 1) {
      appendDiagnosticsEntry(session.id, null, samplePayload({ participantId: 'owner-participant', clientName: 'Owner' }), db);
    }
    for (let i = 0; i < 2; i += 1) {
      appendDiagnosticsEntry(session.id, null, samplePayload({ participantId: 'guest-participant', clientName: 'Guest' }), db);
    }
    // NULL-attribution row must be excluded.
    appendDiagnosticsEntry(session.id, null, { kind: 'sample', roomId: 'room', clientId: 'x', createdAt: Date.now() }, db);

    const participants = getSessionParticipants('jrom@silverjrom.app', session.id, db);
    expect(participants).not.toBeNull();
    expect(participants!).toHaveLength(2);

    const ownerP = participants!.find((p) => p.participantId === 'owner-participant')!;
    expect(ownerP.participantName).toBe('Owner');
    expect(ownerP.sampleCount).toBe(3);

    const guestP = participants!.find((p) => p.participantId === 'guest-participant')!;
    expect(guestP.participantName).toBe('Guest');
    expect(guestP.sampleCount).toBe(2);

    expect(getSessionParticipants('other@silverjrom.app', session.id, db)).toBeNull();
  });

  it('P-7/P-8 GET diagnostics surfaces participants[] + ?participantId filter, two-participant end-to-end (DR-41 admit flow)', async () => {
    const db = createTestDb();
    seedUser(db);
    insertUser(db, 'other@silverjrom.app');
    const room = createRoom('All-sides room', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const nonOwnerCookie = `session=${createSession('other@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', clientKey: 'owner-key-p8' }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', clientKey: 'guest-key-p8' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: String(knocking.clientId) }));
    const guestAdmitted = await nextMessage(guest, (msg) => msg.type === 'admitted');

    const ownerParticipantId = String(ownerAdmitted.participantId);
    const guestParticipantId = String(guestAdmitted.participantId);
    expect(ownerParticipantId).not.toBe(guestParticipantId);

    await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .set('Cookie', ownerCookie)
      .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId, clientKey: 'owner-key-p8', clientName: 'Owner' }))
      .expect(200);
    await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .send(samplePayload({ clientId: guestAdmitted.clientId, participantId: guestAdmitted.participantId, clientKey: 'guest-key-p8', clientName: 'Guest' }))
      .expect(200);

    const dbRows = db
      .prepare('SELECT COUNT(*) AS c FROM meeting_session_diagnostics WHERE session_id = ?')
      .get(sessionId) as { c: number };
    expect(dbRows.c).toBe(2);

    // getSessionParticipants returns both sides.
    const participants = getSessionParticipants('jrom@silverjrom.app', sessionId, db)!;
    expect(participants).toHaveLength(2);
    expect(participants.find((p) => p.participantId === ownerParticipantId)).toMatchObject({ participantName: 'Owner', sampleCount: 1 });
    expect(participants.find((p) => p.participantId === guestParticipantId)).toMatchObject({ participantName: 'Guest', sampleCount: 1 });

    // GET surfaces participants[] + entries with participantId/participantName; existing shape preserved.
    const detail = await request(server).get(`/api/meeting-sessions/${sessionId}/diagnostics`).set('Cookie', ownerCookie).expect(200);
    expect(detail.body.session).toMatchObject({ id: sessionId });
    expect(detail.body.entries).toHaveLength(2);
    expect(Array.isArray(detail.body.participants)).toBe(true);
    expect(detail.body.participants).toHaveLength(2);
    expect(detail.body.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: ownerParticipantId, participantName: 'Owner', sampleCount: 1 }),
        expect.objectContaining({ participantId: guestParticipantId, participantName: 'Guest', sampleCount: 1 }),
      ]),
    );
    expect(detail.body.entries[0]).toHaveProperty('participantId');
    expect(detail.body.entries[0]).toHaveProperty('participantName');

    // ?participantId isolates each side; participants[] unaffected.
    const ownerFiltered = await request(server)
      .get(`/api/meeting-sessions/${sessionId}/diagnostics?participantId=${ownerParticipantId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(ownerFiltered.body.entries).toHaveLength(1);
    expect(ownerFiltered.body.entries[0].participantId).toBe(ownerParticipantId);
    expect(ownerFiltered.body.participants).toHaveLength(2);

    const guestFiltered = await request(server)
      .get(`/api/meeting-sessions/${sessionId}/diagnostics?participantId=${guestParticipantId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(guestFiltered.body.entries).toHaveLength(1);
    expect(guestFiltered.body.entries[0].participantId).toBe(guestParticipantId);

    // Nonexistent participant → empty entries, participants[] unaffected.
    const noneFiltered = await request(server)
      .get(`/api/meeting-sessions/${sessionId}/diagnostics?participantId=never-existed`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(noneFiltered.body.entries).toHaveLength(0);
    expect(noneFiltered.body.participants).toHaveLength(2);

    // Empty-string participantId treated as no filter.
    const emptyFiltered = await request(server)
      .get(`/api/meeting-sessions/${sessionId}/diagnostics?participantId=`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(emptyFiltered.body.entries).toHaveLength(2);

    // Non-owner still 404.
    await request(server).get(`/api/meeting-sessions/${sessionId}/diagnostics`).set('Cookie', nonOwnerCookie).expect(404);

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });

  it('G-1 accepts a durable admitted guest re-posting with a STALE clientId after reconnect grace expiry', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Gate reconnect G-1', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'durable-gate-key-g1' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: String(knocking.clientId) }));
    const guestAdmitted = await nextMessage(guest, (msg) => msg.type === 'admitted');

    // Expire the guest peer: terminate + advance past DISCONNECT_GRACE_MS (120_000ms).
    vi.useFakeTimers();
    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
    guest.terminate();
    await peerReconnectingPromise;
    await vi.advanceTimersByTimeAsync(120_001);
    vi.useRealTimers();
    // Guest is now absent from live.admitted + live.reconnecting; durable clientIdentities entry survives.

    const res = await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .send(samplePayload({
        clientId: guestAdmitted.clientId,
        participantId: guestAdmitted.participantId,
        clientKey: 'durable-gate-key-g1',
        clientName: 'Guest',
      }))
      .expect(200);
    expect(res.body.entry).not.toBeNull();

    const detail = await request(server)
      .get(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(detail.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.entries[0].payload.clientName).toBe('Guest');
    expect(detail.body.entries[0].payload.clientKey).toBe('durable-gate-key-g1');

    closeWs(owner);
    await closeServer(server);
  });

  it('G-2 still accepts a durable admitted guest re-posting with clientId OMITTED after grace expiry', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Gate reconnect G-2', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'durable-gate-key-g2' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: String(knocking.clientId) }));
    const guestAdmitted = await nextMessage(guest, (msg) => msg.type === 'admitted');

    vi.useFakeTimers();
    const peerReconnectingPromise = nextMessage(owner, (msg) => msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
    guest.terminate();
    await peerReconnectingPromise;
    await vi.advanceTimersByTimeAsync(120_001);
    vi.useRealTimers();

    const res = await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .send(samplePayload({
        clientId: undefined,
        participantId: guestAdmitted.participantId,
        clientKey: 'durable-gate-key-g2',
        clientName: 'Guest',
      }))
      .expect(200);
    expect(res.body.entry).not.toBeNull();

    closeWs(owner);
    await closeServer(server);
  });

  it('G-3 rejects a never-admitted clientKey even with a plausible clientId (security preserved)', async () => {
    const db = createTestDb();
    seedUser(db);
    const room = createRoom('Gate reconnect G-3', 'jrom@silverjrom.app', db);
    setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
    const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const { server, url } = await startWsServer(db);

    const owner = await connectWs(url, ownerCookie);
    owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
    const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
    const sessionId = String(ownerAdmitted.sessionId);

    const guest = await connectWs(url);
    guest.send(JSON.stringify({ type: 'join', room: room.id, name: 'Guest', supportsReconnect: true, clientKey: 'real-guest-key-g3' }));
    const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
    await nextMessage(owner, (msg) => msg.type === 'knock');
    owner.send(JSON.stringify({ type: 'admit', clientId: String(knocking.clientId) }));
    const guestAdmitted = await nextMessage(guest, (msg) => msg.type === 'admitted');

    // Unknown clientKey has no durable identity entry → durable path returns false → 403.
    await request(server)
      .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
      .send(samplePayload({
        clientId: guestAdmitted.clientId,
        participantId: guestAdmitted.participantId,
        clientKey: 'never-admitted-key-g3',
        clientName: 'Guest',
      }))
      .expect(403);

    closeWs(guest);
    closeWs(owner);
    await closeServer(server);
  });
});
