const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4700;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const RECORDINGS_DIR = path.join(ROOT, '..', 'recordings');
const PUBLIC_DIR = path.join(ROOT, 'public');
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

let data = { users: [], rooms: {}, sessions: {} };

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      data = { users: raw.users || [], rooms: raw.rooms || {}, sessions: raw.sessions || {} };
    } catch (err) {
      console.error('[data] failed to parse data.json, starting empty', err);
    }
  }
}

function saveData() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

loadData();

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions[token] = { email, expiresAt: Date.now() + SESSION_TTL_MS };
  saveData();
  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  const s = data.sessions[token];
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    delete data.sessions[token];
    saveData();
    return null;
  }
  return data.users.find(u => u.email.toLowerCase() === s.email.toLowerCase()) || null;
}

function destroySession(token) {
  if (token && data.sessions[token]) {
    delete data.sessions[token];
    saveData();
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || req.secure;
}

function setSessionCookie(req, res, value, maxAgeSec) {
  const parts = [`session=${encodeURIComponent(value)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

function authMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const user = getSessionUser(cookies.session);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  req.sessionToken = cookies.session;
  next();
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!email || !password) {
    console.log(`[login] BAD-REQ from ${ip}: missing fields (email=${!!email}, password=${!!password})`);
    return res.status(400).json({ error: 'missing fields' });
  }
  const user = data.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) {
    console.log(`[login] FAIL from ${ip}: unknown email "${email}"`);
    return res.status(401).json({ error: 'invalid credentials' });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    console.log(`[login] FAIL from ${ip}: wrong password for "${email}" (pw length=${password.length})`);
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = createSession(user.email);
  setSessionCookie(req, res, token, Math.floor(SESSION_TTL_MS / 1000));
  console.log(`[login] OK from ${ip}: "${user.email}"`);
  res.json({ email: user.email });
});

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  destroySession(cookies.session);
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const user = getSessionUser(cookies.session);
  if (!user) return res.json({ user: null });
  res.json({ user: { email: user.email } });
});

app.post('/api/rooms', authMiddleware, (req, res) => {
  const id = crypto.randomBytes(6).toString('hex');
  const title = String(req.body?.title || '').slice(0, 100).trim() || `Room ${new Date().toISOString().slice(0, 10)}`;
  const room = { id, title, ownerEmail: req.user.email, createdAt: Date.now() };
  data.rooms[id] = room;
  saveData();
  res.json({ room });
});

app.get('/api/rooms', authMiddleware, (req, res) => {
  const list = Object.values(data.rooms)
    .filter(r => r.ownerEmail.toLowerCase() === req.user.email.toLowerCase())
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ rooms: list });
});

app.delete('/api/rooms/:id', authMiddleware, (req, res) => {
  const room = data.rooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'not found' });
  if (room.ownerEmail.toLowerCase() !== req.user.email.toLowerCase()) {
    return res.status(403).json({ error: 'forbidden' });
  }
  delete data.rooms[req.params.id];
  saveData();
  res.json({ ok: true });
});

app.get('/api/rooms/:id/exists', (req, res) => {
  const room = data.rooms[req.params.id];
  if (!room) return res.json({ exists: false });
  res.json({ exists: true, title: room.title });
});

app.post('/upload', (req, res) => {
  const ext = (req.headers['x-ext'] || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'webm';
  const roomId = (req.headers['x-room'] || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 32);
  const room = data.rooms[roomId];
  const roomSlug = room ? room.title.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) : roomId;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(3).toString('hex');
  const filename = `${stamp}_${roomSlug}_${rand}.${ext}`;
  const filepath = path.join(RECORDINGS_DIR, filename);
  const out = fs.createWriteStream(filepath);
  let bytes = 0;
  req.on('data', (chunk) => { bytes += chunk.length; });
  req.pipe(out);
  out.on('finish', () => {
    console.log(`[rec] saved ${filename} (${(bytes / 1024).toFixed(1)} KB)`);
    res.json({ ok: true, file: filename, bytes });
  });
  out.on('error', (err) => {
    console.error('[rec] write error', err);
    res.status(500).json({ ok: false, error: String(err) });
  });
});

app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const liveRooms = new Map();

function getOrCreateLiveRoom(roomId) {
  if (!liveRooms.has(roomId)) liveRooms.set(roomId, { admitted: new Map(), pending: new Map() });
  return liveRooms.get(roomId);
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function isOwnerOf(roomId, email) {
  const room = data.rooms[roomId];
  return !!(room && email && room.ownerEmail.toLowerCase() === email.toLowerCase());
}

function broadcastToOwners(live, roomId, msg) {
  for (const [, peer] of live.admitted) {
    if (isOwnerOf(roomId, peer.userEmail)) send(peer.ws, msg);
  }
}

function admitPeer(roomId, clientId) {
  const live = liveRooms.get(roomId);
  if (!live) return;
  const pending = live.pending.get(clientId);
  if (!pending) return;
  live.pending.delete(clientId);

  const peers = [...live.admitted.entries()].map(([id, p]) => ({ id, name: p.name }));
  send(pending.ws, { type: 'admitted', clientId, peers, roomTitle: data.rooms[roomId].title, isOwner: isOwnerOf(roomId, pending.userEmail) });
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'peer-joined', clientId, name: pending.name });
  }
  live.admitted.set(clientId, pending);
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId });
  console.log(`[room ${roomId}] ADMITTED ${pending.name} (${clientId})  admitted=${live.admitted.size} pending=${live.pending.size}`);
}

function rejectPeer(roomId, clientId, reason = 'rejected by host') {
  const live = liveRooms.get(roomId);
  if (!live) return;
  const pending = live.pending.get(clientId);
  if (!pending) return;
  live.pending.delete(clientId);
  send(pending.ws, { type: 'rejected', reason });
  try { pending.ws.close(); } catch {}
  broadcastToOwners(live, roomId, { type: 'knock-cancelled', clientId });
  console.log(`[room ${roomId}] REJECTED ${pending.name} (${clientId})`);
}

wss.on('connection', (ws, req) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionUser = getSessionUser(cookies.session);
  ws.userEmail = sessionUser?.email || null;

  const clientId = crypto.randomBytes(8).toString('hex');
  let currentRoom = null;
  let myName = 'Anon';
  let state = 'idle';

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const roomId = String(msg.room || '').slice(0, 64);
      if (!data.rooms[roomId]) {
        send(ws, { type: 'error', error: 'room not found' });
        ws.close();
        return;
      }
      currentRoom = roomId;
      myName = String(msg.name || 'Anon').slice(0, 64);
      const live = getOrCreateLiveRoom(roomId);
      const owner = isOwnerOf(roomId, ws.userEmail);
      const entry = { ws, name: myName, userEmail: ws.userEmail };

      if (owner) {
        live.admitted.set(clientId, entry);
        state = 'admitted';
        const peers = [...live.admitted.entries()]
          .filter(([id]) => id !== clientId)
          .map(([id, p]) => ({ id, name: p.name }));
        send(ws, { type: 'admitted', clientId, peers, roomTitle: data.rooms[roomId].title, isOwner: true });
        for (const [id, peer] of live.admitted) {
          if (id !== clientId) send(peer.ws, { type: 'peer-joined', clientId, name: myName });
        }
        if (live.pending.size > 0) {
          const pendingList = [...live.pending.entries()].map(([id, p]) => ({ id, name: p.name }));
          send(ws, { type: 'pending-list', knockers: pendingList });
        }
        console.log(`[room ${roomId}] + OWNER ${myName} (${clientId})  admitted=${live.admitted.size}`);
      } else {
        live.pending.set(clientId, entry);
        state = 'pending';
        send(ws, { type: 'knocking', clientId, roomTitle: data.rooms[roomId].title });
        broadcastToOwners(live, roomId, { type: 'knock', clientId, name: myName });
        console.log(`[room ${roomId}] KNOCK ${myName} (${clientId})  pending=${live.pending.size}`);
      }
      return;
    }

    if (msg.type === 'signal') {
      if (state !== 'admitted') return;
      const live = liveRooms.get(currentRoom);
      if (!live) return;
      const target = live.admitted.get(msg.to);
      if (!target) return;
      send(target.ws, { type: 'signal', from: clientId, data: msg.data });
      return;
    }

    if (msg.type === 'admit' || msg.type === 'reject') {
      if (state !== 'admitted') return;
      if (!isOwnerOf(currentRoom, ws.userEmail)) return;
      const targetId = String(msg.clientId || '');
      if (msg.type === 'admit') admitPeer(currentRoom, targetId);
      else rejectPeer(currentRoom, targetId);
      return;
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    const live = liveRooms.get(currentRoom);
    if (!live) return;
    if (state === 'admitted') {
      live.admitted.delete(clientId);
      for (const [, peer] of live.admitted) {
        send(peer.ws, { type: 'peer-left', clientId });
      }
      console.log(`[room ${currentRoom}] - ${myName} (${clientId})  admitted=${live.admitted.size}`);
    } else if (state === 'pending') {
      live.pending.delete(clientId);
      broadcastToOwners(live, currentRoom, { type: 'knock-cancelled', clientId });
      console.log(`[room ${currentRoom}] CANCEL ${myName} (${clientId})  pending=${live.pending.size}`);
    }
    if (live.admitted.size === 0 && live.pending.size === 0) liveRooms.delete(currentRoom);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`meet-poc listening on http://0.0.0.0:${PORT}`);
  console.log(`  local:    http://localhost:${PORT}`);
  console.log(`  recordings -> ${RECORDINGS_DIR}`);
  console.log(`  users:     ${data.users.length}  rooms: ${Object.keys(data.rooms).length}`);
  if (data.users.length === 0) {
    console.log('  ⚠  No users seeded yet. Run:  node seed.js');
  }
});

module.exports = { hashPassword, verifyPassword, saveData, data };
