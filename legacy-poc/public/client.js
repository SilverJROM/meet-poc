const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  roomId: null,
  roomTitle: null,
  ws: null,
  myId: null,
  myName: 'Anon',
  isOwner: false,
  localStream: null,
  camOn: false,
  micOn: true,
  screenTrack: null,
  peers: new Map(),
  knockers: new Map(),
  pendingMedia: false,
  rec: { active: false, recorder: null, chunks: [], ctx: null, dest: null, sourceFor: new Map() },
};

function showOnly(panelId) {
  for (const p of document.querySelectorAll('.panel')) p.hidden = true;
  $('boot').hidden = true;
  if (panelId) $(panelId).hidden = false;
}

function setStatus(text) { $('status').textContent = text; }

function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

async function init() {
  const m = location.pathname.match(/^\/room\/([a-f0-9]+)$/i);
  state.roomId = m ? m[1] : null;

  try {
    const me = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json());
    state.user = me.user;
  } catch (err) {
    console.warn('me check failed', err);
  }

  if (state.roomId) return enterLobby(state.roomId);
  if (state.user) return showDashboard();
  return showLogin();
}

function showLogin() {
  showOnly('login-panel');
  $('login-email').focus();
}

async function showDashboard() {
  showOnly('dashboard-panel');
  $('user-email').textContent = state.user.email;
  await refreshRooms();
}

async function refreshRooms() {
  const data = await fetch('/api/rooms', { credentials: 'same-origin' }).then(r => r.json());
  renderRooms(data.rooms || []);
}

function renderRooms(rooms) {
  const ul = $('rooms');
  ul.innerHTML = '';
  if (rooms.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No rooms yet. Create one above to get a shareable join link.';
    ul.appendChild(li);
    return;
  }
  for (const r of rooms) {
    const url = `${location.origin}/room/${r.id}`;
    const created = new Date(r.createdAt).toLocaleString();
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="room-title">${escape(r.title)}</div>
      <div class="room-meta">Created ${escape(created)}</div>
      <div class="room-url"><code>${escape(url)}</code></div>
      <div class="room-actions">
        <a class="primary" href="/room/${encodeURIComponent(r.id)}">Join</a>
        <button class="copy-btn" data-url="${escape(url)}">Copy link</button>
        <button class="danger delete-btn" data-id="${escape(r.id)}">Delete</button>
      </div>
    `;
    ul.appendChild(li);
  }
  ul.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch {
        prompt('Copy this link:', btn.dataset.url);
      }
    });
  });
  ul.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this room? The shareable link will stop working.')) return;
      await fetch(`/api/rooms/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE', credentials: 'same-origin' });
      await refreshRooms();
    });
  });
}

async function enterLobby(roomId) {
  showOnly('lobby-panel');
  $('lobby-room-title').textContent = 'Checking room…';
  const info = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/exists`).then(r => r.json()).catch(() => ({ exists: false }));
  if (!info.exists) {
    $('lobby-room-title').textContent = 'Room not found';
    $('lobby-hint').textContent = 'This room does not exist or has been deleted by the host.';
    $('lobby-name').disabled = true;
    $('cam-on').disabled = true;
    $('lobby-join-btn').disabled = true;
    return;
  }
  state.roomTitle = info.title;
  $('lobby-room-title').textContent = info.title;
  $('lobby-hint').textContent = 'Enter your name to join.';
  if (state.user) $('lobby-name').value = state.user.email.split('@')[0];
  $('lobby-name').focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    $('login-error').textContent = err.error === 'invalid credentials' ? 'Wrong email or password.' : (err.error || 'Login failed.');
    return;
  }
  const json = await res.json();
  state.user = { email: json.email };
  showDashboard();
});

$('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  state.user = null;
  showLogin();
});

$('create-room-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('room-title').value.trim();
  const res = await fetch('/api/rooms', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) return;
  $('room-title').value = '';
  await refreshRooms();
});

$('lobby-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await requestJoin();
});

$('cancel-knock-btn').addEventListener('click', () => {
  try { state.ws?.close(); } catch {}
  showLobbyForm();
  $('lobby-error').textContent = '';
});

function showLobbyForm() {
  $('lobby-form').hidden = false;
  $('knocking-state').hidden = true;
}

function showKnockingState() {
  $('lobby-form').hidden = true;
  $('knocking-state').hidden = false;
}

async function requestJoin() {
  $('lobby-error').textContent = '';
  state.myName = $('lobby-name').value.trim() || 'Anon';
  state.camOn = $('cam-on').checked;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: state.camOn ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  } catch (err) {
    $('lobby-error').textContent = `Mic/camera access failed: ${err.message}`;
    return;
  }

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  state.ws = new WebSocket(`${wsProto}://${location.host}`);
  state.ws.onopen = () => {
    state.ws.send(JSON.stringify({ type: 'join', room: state.roomId, name: state.myName }));
  };
  state.ws.onmessage = (evt) => handleSignal(JSON.parse(evt.data));
  state.ws.onclose = () => {
    if ($('call-panel').hidden === false) setStatus('Disconnected from signaling.');
  };
  state.ws.onerror = () => {
    $('lobby-error').textContent = 'Signaling connection error.';
  };
}

function enterCallPanel() {
  showOnly('call-panel');
  $('room-label').textContent = state.roomTitle || state.roomId;
  $('cam-btn').textContent = state.camOn ? 'Camera off' : 'Camera on';
  addLocalTile();
  $('waiting-room').hidden = !state.isOwner || state.knockers.size === 0;
}

async function handleSignal(msg) {
  if (msg.type === 'knocking') {
    state.myId = msg.clientId;
    if (msg.roomTitle) state.roomTitle = msg.roomTitle;
    showKnockingState();
    return;
  }
  if (msg.type === 'rejected') {
    try { state.ws?.close(); } catch {}
    state.localStream?.getTracks().forEach(t => t.stop());
    state.localStream = null;
    showLobbyForm();
    $('lobby-error').textContent = msg.reason ? `Host: ${msg.reason}` : 'The host rejected your request.';
    return;
  }
  if (msg.type === 'admitted') {
    state.myId = msg.clientId;
    state.isOwner = !!msg.isOwner;
    if (msg.roomTitle) state.roomTitle = msg.roomTitle;
    enterCallPanel();
    setStatus(`You are ${state.myName}${state.isOwner ? ' (host)' : ''}. ${msg.peers.length} peer(s) already here.`);
    for (const p of msg.peers) await createPeer(p.id, p.name, true);
    return;
  }
  if (msg.type === 'pending-list') {
    for (const k of msg.knockers || []) state.knockers.set(k.id, { name: k.name });
    renderWaitingRoom();
    return;
  }
  if (msg.type === 'knock') {
    state.knockers.set(msg.clientId, { name: msg.name });
    renderWaitingRoom();
    setStatus(`${msg.name} is asking to join.`);
    return;
  }
  if (msg.type === 'knock-cancelled') {
    state.knockers.delete(msg.clientId);
    renderWaitingRoom();
    return;
  }
  if (msg.type === 'peer-joined') {
    setStatus(`${msg.name} joined.`);
    await createPeer(msg.clientId, msg.name, false);
    return;
  }
  if (msg.type === 'peer-left') {
    const p = state.peers.get(msg.clientId);
    if (p) setStatus(`${p.name} left.`);
    removePeer(msg.clientId);
    return;
  }
  if (msg.type === 'signal') {
    await handlePeerSignal(msg.from, msg.data);
    return;
  }
  if (msg.type === 'error') {
    setStatus(`Server: ${msg.error}`);
    return;
  }
}

function renderWaitingRoom() {
  if (!state.isOwner) return;
  const list = $('waiting-list');
  const count = $('waiting-count');
  count.textContent = state.knockers.size;
  list.innerHTML = '';
  if (state.knockers.size === 0) {
    $('waiting-room').hidden = true;
    return;
  }
  $('waiting-room').hidden = false;
  for (const [id, k] of state.knockers) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="knocker-name">${escape(k.name)}</span>
      <button class="admit-btn" data-id="${escape(id)}">Admit</button>
      <button class="reject-btn" data-id="${escape(id)}">Reject</button>
    `;
    list.appendChild(li);
  }
  list.querySelectorAll('.admit-btn').forEach(btn => {
    btn.addEventListener('click', () => state.ws?.send(JSON.stringify({ type: 'admit', clientId: btn.dataset.id })));
  });
  list.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => state.ws?.send(JSON.stringify({ type: 'reject', clientId: btn.dataset.id })));
  });
}

async function createPeer(peerId, peerName, isInitiator) {
  if (state.peers.has(peerId)) return;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { name: peerName, pc, stream: new MediaStream(), tile: null };
  state.peers.set(peerId, peer);
  peer.tile = addRemoteTile(peerId, peerName, peer.stream);

  for (const track of state.localStream.getTracks()) {
    pc.addTrack(track, state.localStream);
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(peerId, { ice: e.candidate });
  };
  pc.ontrack = (e) => {
    peer.stream.addTrack(e.track);
    if (peer.tile?.video) peer.tile.video.srcObject = peer.stream;
    if (e.track.kind === 'audio') maybeMixPeerAudio(peerId);
  };
  pc.onconnectionstatechange = () => {
    if (peer.tile?.el) peer.tile.el.dataset.state = pc.connectionState;
    if (pc.connectionState === 'failed') {
      setStatus(`Connection to ${peerName} failed — may need a TURN server (see README).`);
    }
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peerId, { sdp: pc.localDescription });
  }
}

async function handlePeerSignal(peerId, data) {
  const peer = state.peers.get(peerId);
  if (!peer) return;
  if (data.sdp) {
    await peer.pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === 'offer') {
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      sendSignal(peerId, { sdp: peer.pc.localDescription });
    }
  } else if (data.ice) {
    try { await peer.pc.addIceCandidate(data.ice); } catch (e) { console.warn('addIceCandidate', e); }
  }
}

function sendSignal(toId, data) {
  state.ws.send(JSON.stringify({ type: 'signal', to: toId, data }));
}

function removePeer(peerId) {
  const peer = state.peers.get(peerId);
  if (!peer) return;
  peer.pc.close();
  peer.tile?.el.remove();
  state.peers.delete(peerId);
  const src = state.rec.sourceFor.get(peerId);
  if (src) { try { src.disconnect(); } catch {} state.rec.sourceFor.delete(peerId); }
}

function addLocalTile() {
  const tiles = $('tiles');
  tiles.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'tile';
  el.id = 'tile-local';
  el.innerHTML = `<video autoplay muted playsinline></video><div class="name">${escape(state.myName)} (you)</div>`;
  el.querySelector('video').srcObject = state.localStream;
  tiles.appendChild(el);
}

function addRemoteTile(peerId, peerName, stream) {
  const tiles = $('tiles');
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.peer = peerId;
  el.innerHTML = `<video autoplay playsinline></video><div class="name">${escape(peerName)}</div>`;
  const video = el.querySelector('video');
  video.srcObject = stream;
  tiles.appendChild(el);
  return { el, video };
}

function toggleMic() {
  const track = state.localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  state.micOn = track.enabled;
  $('mic-btn').textContent = track.enabled ? 'Mute' : 'Unmute';
  $('mic-btn').classList.toggle('active', !track.enabled);
}

async function toggleCam() {
  const existing = state.localStream.getVideoTracks()[0];
  if (existing) {
    existing.stop();
    state.localStream.removeTrack(existing);
    for (const [, peer] of state.peers) {
      const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(null);
    }
    state.camOn = false;
    $('cam-btn').textContent = 'Camera on';
    refreshLocalTile();
    return;
  }
  try {
    const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    const camTrack = camStream.getVideoTracks()[0];
    state.localStream.addTrack(camTrack);
    for (const [, peer] of state.peers) {
      const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(camTrack);
      else peer.pc.addTrack(camTrack, state.localStream);
    }
    state.camOn = true;
    $('cam-btn').textContent = 'Camera off';
    refreshLocalTile();
  } catch (err) {
    setStatus(`Camera access failed: ${err.message}`);
  }
}

function refreshLocalTile() {
  const v = document.querySelector('#tile-local video');
  if (v) v.srcObject = state.localStream;
}

async function toggleScreenShare() {
  if (state.screenTrack) return stopScreenShare();
  try {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = screen.getVideoTracks()[0];
    state.screenTrack = screenTrack;
    for (const [, peer] of state.peers) {
      const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
      else peer.pc.addTrack(screenTrack, state.localStream);
    }
    const v = document.querySelector('#tile-local video');
    if (v) v.srcObject = new MediaStream([screenTrack, ...state.localStream.getAudioTracks()]);
    screenTrack.onended = stopScreenShare;
    $('screen-btn').textContent = 'Stop share';
    $('screen-btn').classList.add('active');
  } catch (err) {
    setStatus(`Screen share failed: ${err.message}`);
  }
}

async function stopScreenShare() {
  if (!state.screenTrack) return;
  try { state.screenTrack.stop(); } catch {}
  state.screenTrack = null;
  const camTrack = state.localStream.getVideoTracks()[0] || null;
  for (const [, peer] of state.peers) {
    const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(camTrack);
  }
  refreshLocalTile();
  $('screen-btn').textContent = 'Share screen';
  $('screen-btn').classList.remove('active');
}

function toggleRecording() {
  if (state.rec.active) stopRecording();
  else startRecording();
}

function startRecording() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();
  state.rec.ctx = ctx;
  state.rec.dest = dest;
  state.rec.sourceFor = new Map();

  try {
    const localSrc = ctx.createMediaStreamSource(state.localStream);
    localSrc.connect(dest);
  } catch (err) { console.warn('local mix add failed', err); }

  for (const [peerId] of state.peers) maybeMixPeerAudio(peerId);

  const mimeOptions = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  const mimeType = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || '';
  const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
  state.rec.recorder = recorder;
  state.rec.chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) state.rec.chunks.push(e.data); };
  recorder.onstop = uploadRecording;
  recorder.start(1000);
  state.rec.active = true;
  $('rec-btn').textContent = 'Stop recording';
  $('rec-btn').classList.add('active');
  $('rec-indicator').hidden = false;
  setStatus('Recording (audio mix: you + all current peers).');
}

function maybeMixPeerAudio(peerId) {
  if (!state.rec.active && !state.rec.ctx) return;
  if (state.rec.sourceFor.has(peerId)) return;
  const peer = state.peers.get(peerId);
  if (!peer || peer.stream.getAudioTracks().length === 0) return;
  try {
    const src = state.rec.ctx.createMediaStreamSource(peer.stream);
    src.connect(state.rec.dest);
    state.rec.sourceFor.set(peerId, src);
  } catch (err) { console.warn('peer mix add failed', err); }
}

async function stopRecording() {
  if (!state.rec.recorder) return;
  state.rec.recorder.stop();
}

async function uploadRecording() {
  const chunks = state.rec.chunks;
  const mime = state.rec.recorder?.mimeType || 'audio/webm';
  const ext = mime.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(chunks, { type: mime });
  state.rec.chunks = [];
  state.rec.active = false;
  $('rec-btn').textContent = 'Record';
  $('rec-btn').classList.remove('active');
  $('rec-indicator').hidden = true;
  try { state.rec.ctx?.close(); } catch {}
  state.rec.ctx = null; state.rec.dest = null; state.rec.recorder = null; state.rec.sourceFor.clear();

  setStatus(`Uploading ${(blob.size / 1024).toFixed(1)} KB recording…`);
  try {
    const res = await fetch('/upload', {
      method: 'POST',
      headers: { 'Content-Type': mime, 'X-Ext': ext, 'X-Room': state.roomId },
      body: blob,
    });
    const json = await res.json();
    setStatus(`Recording saved on server: ${json.file} (${json.bytes} bytes).`);
  } catch (err) {
    setStatus(`Upload failed: ${err.message}`);
  }
}

function leave() {
  try { state.ws?.close(); } catch {}
  for (const [, peer] of state.peers) { try { peer.pc.close(); } catch {} }
  state.peers.clear();
  state.localStream?.getTracks().forEach(t => t.stop());
  if (state.screenTrack) { try { state.screenTrack.stop(); } catch {} }
  if (state.roomId) location.href = '/room/' + encodeURIComponent(state.roomId);
  else location.href = '/';
}

$('mic-btn').addEventListener('click', toggleMic);
$('cam-btn').addEventListener('click', toggleCam);
$('screen-btn').addEventListener('click', toggleScreenShare);
$('rec-btn').addEventListener('click', toggleRecording);
$('leave-btn').addEventListener('click', leave);

const pwInput = $('login-password');
const pwToggle = $('login-password-toggle');
if (pwToggle && pwInput) {
  pwToggle.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    pwToggle.setAttribute('aria-pressed', String(!showing));
    pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    pwToggle.querySelector('.eye-open').hidden = !showing;
    pwToggle.querySelector('.eye-closed').hidden = showing;
    pwInput.focus();
  });
}

init();
